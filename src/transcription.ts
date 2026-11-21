import { Api, GrammyError } from 'grammy';
import { Buffer } from 'node:buffer';
import { MAX_BYTES, MAX_DURATION, splitTranscript } from './audio';
import type { BotEnv, Job } from './types';
import { safeError } from './logging';
import { accountForLongerAudio, hasDailyCapacity, reserveInference } from './quota';
import { text as localizedText } from './messages';
import { transcribeWithGemini } from './gemini';

interface Progress { status: string; transcript: string | null; next_chunk: number }
class PermanentError extends Error {}

async function transcribe(env: BotEnv, api: Api, job: Job, setStage: (stage: string) => void): Promise<string> {
	const geminiTest = env.GEMINI_TRANSCRIBE_TEST === 'true';
	if (geminiTest && !env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is required for the Gemini experiment');
	setStage('quota.preflight');
	if (job.duration !== undefined && (!Number.isFinite(job.duration) || job.duration < 0 || job.duration > MAX_DURATION)) {
		throw new PermanentError(localizedText(job.locale, 'tooLong'));
	}
	if (!await hasDailyCapacity(env, job)) throw new PermanentError(localizedText(job.locale, 'dailyLimit'));
	setStage('telegram.getFile');
	const file = await api.getFile(job.fileId).catch((error: unknown) => {
		if (error instanceof GrammyError && error.error_code === 400) {
			throw new PermanentError(localizedText(job.locale, 'unavailable'));
		}
		throw error;
	});
	if ((file.file_size ?? 0) > MAX_BYTES) throw new PermanentError(localizedText(job.locale, 'tooLarge'));
	if (!file.file_path) throw new PermanentError(localizedText(job.locale, 'unavailable'));
	setStage('telegram.download');
	const response = await fetch(`https://api.telegram.org/file/bot${env.BOT_TOKEN}/${file.file_path}`, {
		signal: AbortSignal.timeout(60_000),
	});
	if (!response.ok) {
		await response.body?.cancel();
		throw new Error(`Audio download failed (HTTP ${response.status})`);
	}
	if (!response.body) throw new Error('Empty audio response');
	// Bound the actual download even when Telegram metadata is missing or incorrect.
	let size = 0;
	const bounded = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
		transform(chunk, controller) {
			size += chunk.byteLength;
			if (size > MAX_BYTES) throw new PermanentError(localizedText(job.locale, 'tooLarge'));
			controller.enqueue(chunk);
		},
	}));
	const data = await new Response(bounded).arrayBuffer();
	if (!size) throw new PermanentError(localizedText(job.locale, 'empty'));
	const audio = Buffer.from(data).toString('base64');
	setStage('quota.reserve');
	const inferenceDay = new Date();
	if (!await reserveInference(env, job, inferenceDay)) throw new PermanentError(localizedText(job.locale, 'dailyLimit'));
	if (geminiTest) {
		setStage('gemini.inference');
		const text = await transcribeWithGemini(env.GEMINI_API_KEY!, audio, job);
		return text || localizedText(job.locale, 'noSpeech');
	}
	setStage('whisper.inference');
	const uzbekTest = env.WHISPER_UZBEK_TEST === 'true';
	if (uzbekTest) console.info('Whisper Uzbek experiment enabled', { jobId: job.id, language: 'uz', beamSize: 8 });
	const result = await env.AI.run('@cf/openai/whisper-large-v3-turbo', {
		// Use the documented JSON-compatible input. An ArrayBuffer nested in an
		// object does not serialize to audio bytes when sent to the inference API.
		audio,
		task: 'transcribe', vad_filter: true, condition_on_previous_text: false,
		...(uzbekTest ? {
			language: 'uz',
			// A short context/spelling sample, not an instruction-following prompt.
			// Keep this modest: examples can bias Whisper toward unspoken words.
			initial_prompt: "O'zbek tilidagi kundalik suhbat, lotin yozuvida. Assalomu alaykum, yaxshimisiz? Bugun ishlar qanday? Rahmat, yaxshi, bo'ladi. O'zbekiston.",
			beam_size: 8,
		} : job.audioLanguage === 'en' || job.audioLanguage === 'uz' ? { language: job.audioLanguage } : {}),
	});
	setStage('whisper.response');
	if (typeof result?.text !== 'string') throw new Error('Whisper response did not contain a text field');
	await accountForLongerAudio(env, job, result.transcription_info?.duration, inferenceDay);
	if ((result.transcription_info?.duration ?? 0) > MAX_DURATION) {
		throw new PermanentError(localizedText(job.locale, 'tooLong'));
	}
	return result.text.trim() || localizedText(job.locale, 'noSpeech');
}

export async function consume(batch: MessageBatch<Job>, env: BotEnv) {
	const api = new Api(env.BOT_TOKEN, { timeoutSeconds: 60 });
	for (const message of batch.messages) {
		const job = message.body;
		let stage = 'db.claim';
		try {
			// A lease outlives a Queue invocation (15 minutes), preventing concurrent duplicates.
			const claim = await env.DB.prepare(`UPDATE jobs SET lease_until = ?1,
				status = CASE WHEN status = 'queued' THEN 'processing' ELSE status END
				WHERE id = ?2 AND status NOT IN ('done', 'failed') AND lease_until < ?3`)
				.bind(Date.now() + 16 * 60_000, job.id, Date.now()).run();
			if (!claim.meta.changes) {
				const row = await env.DB.prepare('SELECT status FROM jobs WHERE id = ?1').bind(job.id).first<Progress>();
				if (!row || row.status === 'done' || row.status === 'failed') message.ack();
				else message.retry({ delaySeconds: 960 });
				continue;
			}
			try {
				stage = 'db.read';
				const row = await env.DB.prepare('SELECT * FROM jobs WHERE id = ?1').bind(job.id).first<Progress>();
				if (!row) throw new Error('Missing job');
				let text = row.transcript;
				if (batch.queue.endsWith('-dlq')) {
					text = localizedText(job.locale, 'processingError');
				} else if (text === null) {
					try {
						text = await transcribe(env, api, job, (value) => { stage = value; });
					} catch (error) {
						if (!(error instanceof PermanentError)) throw error;
						text = error.message;
					}
					stage = 'db.saveTranscript';
					await env.DB.prepare("UPDATE jobs SET transcript = ?1, status = 'ready' WHERE id = ?2").bind(text, job.id).run();
				}
				const chunks = splitTranscript(text);
				for (let i = batch.queue.endsWith('-dlq') ? 0 : row.next_chunk; i < chunks.length; i++) {
					stage = 'telegram.sendMessage';
					await api.sendMessage(job.chatId, chunks[i], {
						reply_parameters: { message_id: job.messageId, allow_sending_without_reply: true },
					});
					stage = 'db.saveDelivery';
					await env.DB.prepare('UPDATE jobs SET next_chunk = ?1 WHERE id = ?2').bind(i + 1, job.id).run();
				}
				stage = 'db.complete';
				await env.DB.prepare('UPDATE jobs SET status = ?1, transcript = NULL WHERE id = ?2')
					.bind(batch.queue.endsWith('-dlq') ? 'failed' : 'done', job.id).run();
				message.ack();
			} finally {
				await env.DB.prepare('UPDATE jobs SET lease_until = 0 WHERE id = ?1').bind(job.id).run();
			}
		} catch (error) {
			console.error('Transcription job failed', {
				jobId: job.id, attempt: message.attempts, queue: batch.queue, stage,
				...safeError(error, [env.BOT_TOKEN, env.WEBHOOK_SECRET, env.GEMINI_API_KEY ?? '']),
			});
			if (error instanceof GrammyError && [400, 403].includes(error.error_code)) {
				await env.DB.prepare("UPDATE jobs SET status = 'failed', transcript = NULL WHERE id = ?1").bind(job.id).run();
				message.ack();
			} else {
				message.retry({ delaySeconds: Math.min(3600, Math.max(30 * 2 ** Math.min(message.attempts, 6),
					error instanceof GrammyError ? error.parameters.retry_after ?? 0 : 0)) });
			}
		}
	}
}
