import { Api, GrammyError } from 'grammy';
import { Buffer } from 'node:buffer';
import { MAX_BYTES, MAX_DURATION, splitTranscript } from './audio';
import type { BotEnv, Job } from './types';
import { safeError } from './logging';

interface Progress { status: string; transcript: string | null; next_chunk: number }
class PermanentError extends Error {}

async function transcribe(env: BotEnv, api: Api, job: Job, setStage: (stage: string) => void): Promise<string> {
	setStage('telegram.getFile');
	const file = await api.getFile(job.fileId).catch((error: unknown) => {
		if (error instanceof GrammyError && error.error_code === 400) {
			throw new PermanentError('Audio is unavailable or too large. Please send a recording under 20 MB again.');
		}
		throw error;
	});
	if ((file.file_size ?? 0) > MAX_BYTES) throw new PermanentError('Audio exceeds the 20 MB limit.');
	if (!file.file_path) throw new PermanentError('Audio is unavailable. Please send it again.');
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
			if (size > MAX_BYTES) throw new PermanentError('Audio exceeds the 20 MB limit.');
			controller.enqueue(chunk);
		},
	}));
	const data = await new Response(bounded).arrayBuffer();
	if (!size) throw new PermanentError('The audio file is empty.');
	setStage('whisper.inference');
	const result = await env.AI.run('@cf/openai/whisper-large-v3-turbo', {
		// Use the documented JSON-compatible input. An ArrayBuffer nested in an
		// object does not serialize to audio bytes when sent to the inference API.
		audio: Buffer.from(data).toString('base64'),
		task: 'transcribe', vad_filter: true, condition_on_previous_text: false,
	});
	setStage('whisper.response');
	if (typeof result?.text !== 'string') throw new Error('Whisper response did not contain a text field');
	if ((result.transcription_info?.duration ?? 0) > MAX_DURATION) {
		throw new PermanentError('Audio exceeds the 10-minute limit.');
	}
	return result.text.trim() || 'No speech could be detected in this recording.';
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
					text = 'Sorry, I could not process this recording after several attempts. Please send it again later.';
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
				...safeError(error, [env.BOT_TOKEN, env.WEBHOOK_SECRET]),
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
