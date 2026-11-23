import { env } from 'cloudflare:test';
import { Api } from 'grammy';
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import migration from '../migrations/0001_jobs.sql?raw';
import quotaMigration from '../migrations/0002_global_usage.sql?raw';
import preferencesMigration from '../migrations/0003_user_preferences.sql?raw';
import translationsMigration from '../migrations/0004_translations.sql?raw';
import dropTranslationsMigration from '../migrations/0005_drop_translation_jobs.sql?raw';
import russianMigration from '../migrations/0006_russian_preferences.sql?raw';
import monthlyUsageMigration from '../migrations/0007_user_monthly_usage.sql?raw';
import dailyCounterMigration from '../migrations/0008_user_daily_counter.sql?raw';
import profileMigration from '../migrations/0009_user_profile.sql?raw';
import worker from '../src/index';
import { createBot } from '../src/bot';
import { getAudio, splitTranscript } from '../src/audio';
import { submitJob } from '../src/jobs';
import { consume } from '../src/transcription';
import { safeError } from '../src/logging';
import { DAILY_LIMIT_MESSAGE, USER_LIMIT_MESSAGE, reserveInference, userQuotaLimits } from '../src/quota';
import { preferenceStore } from '../src/preferences';
import { text, languageStatus, usageText } from '../src/messages';
import type { BotEnv, Job } from '../src/types';
import type { Message as TelegramMessage } from 'grammy/types';

const job: Job = { id: 1, userId: 2, chatId: 2, messageId: 3, fileId: 'voice-file', mimeType: 'audio/ogg' };
const db = (env as unknown as BotEnv).DB;
const send = vi.fn().mockResolvedValue(undefined);
const run = vi.fn().mockResolvedValue({ text: 'Salom! Hello!', transcription_info: { duration: 2 } });
const bindings = { ...env, DB: db, BOT_TOKEN: '123:test', WEBHOOK_SECRET: 'test-secret', GEMINI_TRANSCRIBE_TEST: 'false',
	TRANSCRIPTIONS: { send }, AI: { run } } as unknown as BotEnv;

function batch(queue = 'transcribbr-transcriptions') {
	const message = { body: job, id: 'queue-id', attempts: 1, timestamp: new Date(), ack: vi.fn(), retry: vi.fn() };
	return { queue, messages: [message], metadata: { metrics: { backlogCount: 0, backlogBytes: 0 } }, ackAll: vi.fn(), retryAll: vi.fn() };
}

beforeAll(async () => {
	for (const sql of (migration + quotaMigration + preferencesMigration + translationsMigration
		+ dropTranslationsMigration + russianMigration + monthlyUsageMigration + dailyCounterMigration
		+ profileMigration).split(';').filter((sql) => sql.trim())) await db.prepare(sql).run();
});
beforeEach(async () => {
	vi.spyOn(Api.prototype, 'sendChatAction').mockResolvedValue(true);
	vi.spyOn(Api.prototype, 'setMyCommands').mockResolvedValue(true);
	vi.spyOn(Api.prototype, 'setChatMenuButton').mockResolvedValue(true);
	await db.prepare('DELETE FROM jobs').run();
	await db.prepare('DELETE FROM daily_ai_usage').run();
	await db.prepare('DELETE FROM user_monthly_usage').run();
	await db.prepare('DELETE FROM user_preferences').run();
	send.mockClear();
	run.mockClear();
	run.mockResolvedValue({ text: 'Salom! Hello!', transcription_info: { duration: 2 } });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('webhook', () => {
	it('accepts an authenticated forwarded voice update without running inference in the webhook', async () => {
		const reply = vi.spyOn(Api.prototype, 'sendMessage').mockResolvedValue({ message_id: 9 } as TelegramMessage.TextMessage);
		const update = {
			update_id: 1,
			message: { message_id: 3, date: 1, chat: { id: 2, type: 'private', first_name: 'Test' },
				from: { id: 2, is_bot: false, first_name: 'Test' },
				forward_origin: { type: 'hidden_user', sender_user_name: 'Sender', date: 1 },
				voice: { file_id: 'voice-file', file_unique_id: 'unique', duration: 2, mime_type: 'audio/ogg' } },
		};
		const request = new Request<unknown, IncomingRequestCfProperties>('https://bot/webhook', {
			method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'test-secret' },
			body: JSON.stringify(update),
		});
		const response = await worker.fetch(request.clone(), bindings);
		expect(response.status).toBe(200);
		expect(send).toHaveBeenCalledWith({ ...job, duration: 2, locale: 'en', audioLanguage: 'auto' });
		expect(reply).toHaveBeenCalledWith(job.chatId, text('en', 'received'), expect.objectContaining({
			reply_markup: { remove_keyboard: true },
		}), undefined);
		expect(run).not.toHaveBeenCalled();
		await worker.fetch(request.clone(), bindings);
		expect(reply).toHaveBeenCalledTimes(1); // A webhook retry must not duplicate the acknowledgment.
	});
	it('has a health endpoint and rejects unauthenticated updates', async () => {
		expect((await worker.fetch(new Request('https://bot/health'), bindings)).status).toBe(200);
		expect((await worker.fetch(new Request('https://bot/webhook', { method: 'POST' }), bindings)).status).toBe(401);
		expect((await worker.fetch(new Request('https://bot/webhook'), bindings)).status).toBe(405);
		expect((await worker.fetch(new Request('https://bot/unknown'), bindings)).status).toBe(404);
		expect(send).not.toHaveBeenCalled();
	});
});

describe('audio', () => {
	it('recognizes voice, MP3 and audio documents, not arbitrary documents', () => {
		expect(getAudio({ voice: { file_id: 'v', duration: 2 } } as TelegramMessage)?.mimeType).toBe('audio/ogg');
		expect(getAudio({ audio: { file_id: 'a', mime_type: 'audio/mpeg' } } as TelegramMessage)?.fileId).toBe('a');
		expect(getAudio({ document: { file_id: 'd', file_name: 'note.OGG' } } as TelegramMessage)?.mimeType).toBe('audio/ogg');
		expect(getAudio({ document: { file_id: 'd', file_name: 'report.pdf' } } as TelegramMessage)).toBeUndefined();
	});
	it('splits long transcripts without breaking emoji', () => {
		const text = 'a'.repeat(3999) + '😀' + 'b'.repeat(5000);
		const chunks = splitTranscript(text);
		expect(chunks.join('')).toBe(text);
		expect(chunks.every((chunk) => chunk.length <= 4000 && chunk.isWellFormed())).toBe(true);
	});
});

describe('job admission', () => {
	it('repairs enqueue failures on webhook retry and deduplicates completed jobs', async () => {
		send.mockRejectedValueOnce(new Error('queue unavailable'));
		await expect(submitJob(bindings, job)).rejects.toThrow();
		expect(await submitJob(bindings, job)).toBe('duplicate');
		expect(await db.prepare('SELECT COUNT(*) AS count FROM jobs').first('count')).toBe(1);
		await db.prepare("UPDATE jobs SET status = 'done'").run();
		send.mockClear();
		expect(await submitJob(bindings, job)).toBe('duplicate');
		expect(send).not.toHaveBeenCalled();
	});
	it('limits each user to five jobs per minute', async () => {
		for (let id = 1; id <= 5; id++) expect(await submitJob(bindings, { ...job, id })).toBe(true);
		expect(await submitJob(bindings, { ...job, id: 6 })).toBe(false);
		expect(await submitJob(bindings, { ...job, id: 7, userId: 99 })).toBe(true);
	});
	it('caps each user monthly by transcriptions, audio minutes, and daily jobs', async () => {		const byCount = { ...bindings, USER_MONTHLY_TRANSCRIPTIONS: '1' };
		expect(await submitJob(byCount, { ...job, id: 10 })).toBe(true);
		expect(await submitJob(byCount, { ...job, id: 11 })).toBe(USER_LIMIT_MESSAGE);
		await db.prepare('DELETE FROM jobs').run();
		await db.prepare('DELETE FROM user_monthly_usage').run();

		const byMinutes = { ...bindings, USER_MONTHLY_AUDIO_MINUTES: '1' };
		expect(await submitJob(byMinutes, { ...job, id: 20, duration: 60 })).toBe(true);
		expect(await submitJob(byMinutes, { ...job, id: 21, duration: 60 })).toBe(USER_LIMIT_MESSAGE);

		await db.prepare('DELETE FROM jobs').run();
		await db.prepare('DELETE FROM user_monthly_usage').run();
		send.mockClear();
		const byDay = { ...bindings, USER_DAILY_TRANSCRIPTIONS: '1' };
		expect(await submitJob(byDay, { ...job, id: 30 })).toBe(true);
		expect(await submitJob(byDay, { ...job, id: 31 })).toBe(USER_LIMIT_MESSAGE);
		expect(await db.prepare('SELECT COUNT(*) AS count FROM jobs').first('count')).toBe(1);
		expect(send).toHaveBeenCalledTimes(1);
	});
	it('lets configured admins bypass per-user limits', async () => {
		const admin = { ...bindings, USER_MONTHLY_TRANSCRIPTIONS: '0', ADMIN_USER_IDS: ' 2 , 99 ' };
		expect(await submitJob(admin, { ...job, id: 40 })).toBe(true);
		expect(await db.prepare('SELECT COUNT(*) AS count FROM user_monthly_usage').first('count')).toBe(0);
	});
});

describe('consumer', () => {
	function mockTelegram() {
		vi.spyOn(Api.prototype, 'getFile').mockResolvedValue({ file_id: 'v', file_unique_id: 'u', file_path: 'voice/note.oga', file_size: 4 });
		const reply = vi.spyOn(Api.prototype, 'sendMessage').mockResolvedValue({ message_id: 9 } as TelegramMessage.TextMessage);
		vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(new Uint8Array([79, 103, 103, 83]))));
		return reply;
	}
	it('transcribes, replies, clears temporary text, and skips duplicate delivery', async () => {
		const reply = mockTelegram();
		await submitJob(bindings, job);
		const first = batch();
		await consume(first, bindings);
		expect(first.messages[0].ack).toHaveBeenCalled();
		expect(run).toHaveBeenCalledWith('@cf/openai/whisper-large-v3-turbo', {
			audio: 'T2dnUw==', task: 'transcribe', vad_filter: true, condition_on_previous_text: false,
		});
		expect(reply).toHaveBeenCalledWith(2, 'Salom! Hello!', expect.anything());
		expect(await db.prepare('SELECT status, transcript FROM jobs').first()).toMatchObject({ status: 'done', transcript: null });
		await consume(batch(), bindings);
		expect(run).toHaveBeenCalledTimes(1);
		expect(reply).toHaveBeenCalledTimes(1);
		expect(Api.prototype.sendChatAction).not.toHaveBeenCalled();
		expect(reply.mock.calls[0][2]).toMatchObject({ reply_markup: {
			inline_keyboard: [[{ text: text('en', 'translateButton'), callback_data: 'translate' }]],
		} });
	});
	it('retries delivery without retranscribing', async () => {
		const reply = mockTelegram();
		reply.mockRejectedValueOnce(new Error('network unavailable'));
		await submitJob(bindings, job);
		const first = batch();
		await consume(first, bindings);
		expect(first.messages[0].retry).toHaveBeenCalled();
		await consume(batch(), bindings);
		expect(run).toHaveBeenCalledTimes(1);
		expect(reply).toHaveBeenCalledTimes(2);
		expect(Api.prototype.sendChatAction).not.toHaveBeenCalled();
		expect(await db.prepare('SELECT inference_calls FROM daily_ai_usage').first('inference_calls')).toBe(1);
	});
	it('uses Gemini when enabled and retries delivery without another inference', async () => {
		const reply = mockTelegram();
		reply.mockRejectedValueOnce(new Error('delivery unavailable'));
		vi.mocked(fetch).mockResolvedValueOnce(new Response(new Uint8Array([79, 103, 103, 83])))
			.mockResolvedValueOnce(Response.json({ status: 'completed', steps: [
				{ type: 'model_output', content: [{ type: 'text', text: ' Gemini transcript ' }] },
			] }));
		const testBindings = { ...bindings, GEMINI_TRANSCRIBE_TEST: 'true', GEMINI_API_KEY: 'test-gemini-key' };
		await submitJob(testBindings, job);
		const first = batch();
		await consume(first, testBindings);
		expect(first.messages[0].retry).toHaveBeenCalled();
		await consume(batch(), testBindings);
		expect(run).not.toHaveBeenCalled();
		expect(fetch).toHaveBeenCalledTimes(2); // Telegram download + Google inference only.
		expect(reply).toHaveBeenLastCalledWith(2, 'Gemini transcript', expect.anything());
		expect(await db.prepare('SELECT inference_calls FROM daily_ai_usage').first('inference_calls')).toBe(1);
	});
	it('fails closed without a Gemini key before downloading or reserving inference', async () => {
		mockTelegram();
		vi.spyOn(console, 'error').mockImplementation(() => {});
		await submitJob(bindings, job);
		const delivery = batch();
		await consume(delivery, { ...bindings, GEMINI_TRANSCRIBE_TEST: 'true', GEMINI_API_KEY: undefined });
		expect(fetch).not.toHaveBeenCalled();
		expect(run).not.toHaveBeenCalled();
		expect(delivery.messages[0].retry).toHaveBeenCalled();
		expect(await db.prepare('SELECT COUNT(*) AS count FROM daily_ai_usage').first('count')).toBe(0);
	});
	it('retries Gemini HTTP failures without invoking Whisper or logging private provider content', async () => {
		const reply = mockTelegram();
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.mocked(fetch).mockResolvedValueOnce(new Response(new Uint8Array([79, 103, 103, 83])))
			.mockResolvedValueOnce(new Response('test-gemini-key private transcript', { status: 429 }));
		await submitJob(bindings, job);
		const delivery = batch();
		await consume(delivery, { ...bindings, GEMINI_TRANSCRIBE_TEST: 'true', GEMINI_API_KEY: 'test-gemini-key' });
		expect(delivery.messages[0].retry).toHaveBeenCalled();
		expect(run).not.toHaveBeenCalled();
		expect(reply).not.toHaveBeenCalled();
		expect(log).toHaveBeenCalledWith('Transcription job failed', expect.objectContaining({
			stage: 'gemini.inference', errorMessage: 'Gemini transcription failed (HTTP 429)',
		}));
	});
	it('resumes at the next unsent chunk after a partial reply failure', async () => {
		const reply = mockTelegram();
		run.mockResolvedValueOnce({ text: 'a'.repeat(5000) });
		reply.mockResolvedValueOnce({ message_id: 9 } as TelegramMessage.TextMessage)
			.mockRejectedValueOnce(new Error('network unavailable'));
		await submitJob(bindings, job);
		await consume(batch(), bindings);
		expect(await db.prepare('SELECT next_chunk FROM jobs').first('next_chunk')).toBe(1);
		await consume(batch(), bindings);
		expect(run).toHaveBeenCalledTimes(1);
		expect(reply.mock.calls.map((call) => call[1].length)).toEqual([4000, 1000, 1000]);
	});
	it('rejects oversized metadata before downloading or running inference', async () => {
		const reply = mockTelegram();
		vi.mocked(Api.prototype.getFile).mockResolvedValueOnce({ file_id: 'v', file_unique_id: 'u', file_size: 20_000_001 });
		await submitJob(bindings, job);
		await consume(batch(), bindings);
		expect(reply).toHaveBeenCalledWith(2, expect.stringContaining('20 MB'), expect.anything());
		expect(fetch).not.toHaveBeenCalled();
		expect(run).not.toHaveBeenCalled();
	});
	it('retries temporary inference failures and releases the lease', async () => {
		mockTelegram();
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		run.mockRejectedValueOnce(new Error('inference unavailable'));
		await submitJob(bindings, job);
		const delivery = batch();
		await consume(delivery, bindings);
		expect(log).toHaveBeenCalledWith('Transcription job failed', expect.objectContaining({
			stage: 'whisper.inference', errorMessage: 'inference unavailable',
		}));
		expect(delivery.messages[0].retry).toHaveBeenCalled();
		expect(await db.prepare('SELECT lease_until FROM jobs').first('lease_until')).toBe(0);
		await consume(batch(), bindings);
		expect(run).toHaveBeenCalledTimes(2);
		expect(await db.prepare('SELECT inference_calls FROM daily_ai_usage').first('inference_calls')).toBe(2);
	});
	it('does not steal active leases', async () => {
		await submitJob(bindings, job);
		await db.prepare('UPDATE jobs SET lease_until = ?1').bind(Date.now() + 60000).run();
		const delivery = batch();
		await consume(delivery, bindings);
		expect(delivery.messages[0].retry).toHaveBeenCalled();
		expect(run).not.toHaveBeenCalled();
	});
	it('notifies users when retries reach the dead-letter queue', async () => {
		const reply = mockTelegram();
		await submitJob(bindings, job);
		await consume(batch('transcribbr-transcriptions-dlq'), bindings);
		expect(reply).toHaveBeenCalledWith(2, text('en', 'processingError'), expect.anything());
		expect(await db.prepare('SELECT status FROM jobs').first('status')).toBe('failed');
		expect(run).not.toHaveBeenCalled();
	});
});

describe('safe diagnostics', () => {
	it('redacts secrets, URLs and large payloads without logging raw errors', () => {
		const error = new Error(`Failure secret-value https://api.telegram.org/file/bot123:abc/voice.oga 456:def ${'A'.repeat(100)}`);
		const result = safeError(error, ['secret-value']);
		expect(result.errorMessage).toContain('Failure');
		expect(result.errorMessage).not.toContain('secret-value');
		expect(result.errorMessage).not.toContain('api.telegram.org');
		expect(result.errorMessage).not.toContain('456:def');
		expect(result.errorMessage).not.toContain('A'.repeat(100));
		expect(result).not.toHaveProperty('stack');
	});
});

describe('global AI quota', () => {
	it('uses one shared budget across users and rejects concurrent overruns', async () => {
		const capped = { ...bindings, GLOBAL_DAILY_AUDIO_MINUTES: '1', GLOBAL_DAILY_AI_CALLS: '500' };
		const accepted = await Promise.all(Array.from({ length: 12 }, (_, index) =>
			reserveInference(capped, { ...job, userId: index, duration: 20 })));
		expect(accepted.filter(Boolean)).toHaveLength(3);
		expect(await db.prepare('SELECT reserved_seconds, inference_calls FROM daily_ai_usage').first())
			.toEqual({ reserved_seconds: 60, inference_calls: 3 });
	});
	it('enforces the call cap independently of audio minutes', async () => {
		const capped = { ...bindings, GLOBAL_DAILY_AI_CALLS: '2' };
		expect(await reserveInference(capped, { ...job, duration: 1 })).toBe(true);
		expect(await reserveInference(capped, { ...job, duration: 1 })).toBe(true);
		expect(await reserveInference(capped, { ...job, duration: 1 })).toBe(false);
		expect(await db.prepare('SELECT reserved_seconds FROM daily_ai_usage').first('reserved_seconds')).toBe(20);
	});
	it('enforces the global monthly call cap across days', async () => {
		const capped = { ...bindings, GLOBAL_MONTHLY_AI_CALLS: '1' };
		expect(await reserveInference(capped, { ...job, duration: 1 }, new Date('2026-11-02T10:00:00Z'))).toBe(true);
		expect(await reserveInference(capped, { ...job, duration: 1 }, new Date('2026-11-03T10:00:00Z'))).toBe(false);
	});
	it('resets on UTC day boundaries without needing cron', async () => {
		const capped = { ...bindings, GLOBAL_DAILY_AI_CALLS: '1' };
		expect(await reserveInference(capped, job, new Date('2026-11-21T23:59:59Z'))).toBe(true);
		expect(await reserveInference(capped, job, new Date('2026-11-21T23:59:59Z'))).toBe(false);
		expect(await reserveInference(capped, job, new Date('2026-11-22T00:00:00Z'))).toBe(true);
	});
	it('reserves ten minutes for unknown durations and fails closed for bad configuration', async () => {
		expect(await reserveInference(bindings, job)).toBe(true);
		expect(await db.prepare('SELECT reserved_seconds FROM daily_ai_usage').first('reserved_seconds')).toBe(600);
		await expect(reserveInference({ ...bindings, GLOBAL_DAILY_AI_CALLS: 'invalid' }, job)).rejects.toThrow();
		expect(await reserveInference({ ...bindings, GLOBAL_DAILY_AUDIO_MINUTES: '0' }, job)).toBe(false);
	});
	it('rejects new jobs before queueing when the shared budget is exhausted', async () => {
		const capped = { ...bindings, GLOBAL_DAILY_AI_CALLS: '0' };
		expect(await submitJob(capped, job)).toBe(DAILY_LIMIT_MESSAGE);
		expect(send).not.toHaveBeenCalled();
		expect(await db.prepare('SELECT COUNT(*) FROM jobs').first('COUNT(*)')).toBe(0);
	});
	it('rechecks queued jobs and notifies without calling AI or downloading', async () => {
		await submitJob(bindings, job);
		const reply = vi.spyOn(Api.prototype, 'sendMessage').mockResolvedValue({ message_id: 9 } as TelegramMessage.TextMessage);
		const getFile = vi.spyOn(Api.prototype, 'getFile');
		const delivery = batch();
		await consume(delivery, { ...bindings, GLOBAL_DAILY_AI_CALLS: '0' });
		expect(reply).toHaveBeenCalledWith(job.chatId, DAILY_LIMIT_MESSAGE, expect.anything());
		expect(getFile).not.toHaveBeenCalled();
		expect(run).not.toHaveBeenCalled();
		expect(delivery.messages[0].ack).toHaveBeenCalled();
	});
	it('records duration underestimates reported by Whisper', async () => {
		const timedJob = { ...job, duration: 10 };
		await submitJob(bindings, timedJob);
		vi.spyOn(Api.prototype, 'getFile').mockResolvedValue({ file_id: 'v', file_unique_id: 'u', file_path: 'voice/note.oga' });
		vi.spyOn(Api.prototype, 'sendMessage').mockResolvedValue({ message_id: 9 } as TelegramMessage.TextMessage);
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array([79, 103, 103, 83]))));
		run.mockResolvedValueOnce({ text: 'Hello', transcription_info: { duration: 30 } });
		const delivery = batch();
		delivery.messages[0].body = timedJob;
		await consume(delivery, bindings);
		expect(await db.prepare('SELECT reserved_seconds FROM daily_ai_usage').first('reserved_seconds')).toBe(30);
	});
	it('limits the global pending backlog independently of user IDs', async () => {
		for (let id = 1; id <= 50; id++) {
			expect(await submitJob(bindings, { ...job, id, userId: id })).toBe(true);
		}
		expect(await submitJob(bindings, { ...job, id: 51, userId: 51 })).toBe(false);
	});
});

describe('friendly onboarding and language preferences', () => {
	async function sendText(value: string, updateId = 10, userId = 2) {
		const response = await worker.fetch(new Request('https://bot/webhook', {
			method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'test-secret' },
			body: JSON.stringify({ update_id: updateId, message: {
				message_id: updateId, date: 1, chat: { id: userId, type: 'private', first_name: 'Test' },
				from: { id: userId, is_bot: false, first_name: 'Test' }, text: value,
				...(value.startsWith('/') ? { entities: [{ type: 'bot_command', offset: 0, length: value.length }] } : {}),
			} }),
		}), bindings);
		expect(response.status).toBe(200);
	}
	it('loads preferences once per update, without caching them across updates', async () => {
		const reply = vi.spyOn(Api.prototype, 'sendMessage').mockResolvedValue({ message_id: 9 } as TelegramMessage.TextMessage);
		const get = vi.fn().mockResolvedValueOnce({ locale: 'en', audioLanguage: 'auto' })
			.mockResolvedValueOnce({ locale: 'uz', audioLanguage: 'en' });
		const bot = createBot('123:test', bindings.BOT_INFO, undefined, { get, touch: vi.fn(), setLocale: vi.fn(), setAudioLanguage: vi.fn() });
		for (const updateId of [1, 2]) {
			await bot.handleUpdate({ update_id: updateId, message: {
				message_id: updateId, date: 1, chat: { id: 2, type: 'private', first_name: 'Test' },
				from: { id: 2, is_bot: false, first_name: 'Test' }, text: '/help',
				entities: [{ type: 'bot_command', offset: 0, length: 5 }],
			} });
			expect(get).toHaveBeenCalledTimes(updateId);
		}
		expect(reply.mock.calls.map((call) => call[1])).toEqual([text('en', 'ready'), text('uz', 'ready')]);
	});
	it('supports native targeted commands and the original recording-language alias', async () => {
		const reply = vi.spyOn(Api.prototype, 'sendMessage').mockResolvedValue({ message_id: 9 } as TelegramMessage.TextMessage);
		await sendText(`/privacy@${bindings.BOT_INFO.username}`);
		expect(reply.mock.calls.at(-1)?.[1]).toBe(text('en', 'privacy'));
		await sendText('/audio_language', 11);
		expect(reply.mock.calls.at(-1)?.[1]).toBe(`${text('en', 'chooseAudio')}\n\n${languageStatus('en', 'auto')}`);
	});
	it('keeps old language commands as aliases while advertising the clearer names', async () => {
		const reply = vi.spyOn(Api.prototype, 'sendMessage').mockResolvedValue({ message_id: 9 } as TelegramMessage.TextMessage);
		for (const [index, command] of ['ui_lang', 'language', 'input_lang', 'audio_language'].entries()) {
			await sendText(`/${command}`, index + 20);
			expect(reply.mock.calls.at(-1)?.[1]).toBe(`${text('en', index < 2 ? 'chooseLanguage' : 'chooseAudio')}\n\n${languageStatus('en', 'auto')}`);
		}
		for (const locale of ['en', 'uz'] as const) {
			expect(text(locale, 'ready')).toContain('/menu_lang');
			expect(text(locale, 'ready')).toContain('/audio_lang');
			expect(text(locale, 'noSpeech')).toContain('/audio_lang');
			expect(text(locale, 'ready')).not.toMatch(/\/(ui_lang|input_lang)\b/);
		}
	});
	it('explains duration limits separately from file-size limits', async () => {
		const reply = vi.spyOn(Api.prototype, 'sendMessage').mockResolvedValue({ message_id: 9 } as TelegramMessage.TextMessage);
		const response = await worker.fetch(new Request('https://bot/webhook', {
			method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'test-secret' },
			body: JSON.stringify({ update_id: 1, message: {
				message_id: 3, date: 1, chat: { id: 2, type: 'private', first_name: 'Test' },
				from: { id: 2, is_bot: false, first_name: 'Test' },
				voice: { file_id: 'voice-file', file_unique_id: 'unique', duration: 601, file_size: 100 },
			} }),
		}), bindings);
		expect(response.status).toBe(200);
		expect(reply.mock.calls.at(-1)?.[1]).toBe(text('en', 'tooLong'));
		expect(send).not.toHaveBeenCalled();
	});
	it('welcomes users with a built-in reply keyboard', async () => {
		const reply = vi.spyOn(Api.prototype, 'sendMessage').mockResolvedValue({ message_id: 9 } as TelegramMessage.TextMessage);
		await sendText('/start');
		expect(reply.mock.calls[0][1]).toBe(text('en', 'welcome'));
		expect(reply.mock.calls[0][2]).toMatchObject({
			reply_markup: { keyboard: [
				[{ text: '🇺🇿 Özbekcha' }, { text: '🇬🇧 English' }], [{ text: '🇷🇺 Русский' }], [{ text: text('en', 'menuBack') }],
			], resize_keyboard: true },
		});
		expect(send).not.toHaveBeenCalled();
	});
	it('persists UI language independently from recording language across webhook invocations', async () => {
		const reply = vi.spyOn(Api.prototype, 'sendMessage').mockResolvedValue({ message_id: 9 } as TelegramMessage.TextMessage);
		await sendText('🇺🇿 Özbekcha');
		expect(await preferenceStore(db).get(2)).toEqual({ locale: 'uz', audioLanguage: 'auto' });
		expect(reply.mock.calls.map((call) => call[1])).toEqual([text('uz', 'uiSaved')]);
		await sendText('🎙 Inglizcha', 11);
		expect(await preferenceStore(db).get(2)).toEqual({ locale: 'uz', audioLanguage: 'en' });
		await sendText('/language', 12);
		expect(reply.mock.calls.at(-1)?.[1]).toBe(`${text('uz', 'chooseLanguage')}\n\n${languageStatus('uz', 'en')}`);
		await sendText('🌐 Avtomatik', 13);
		expect(await preferenceStore(db).get(2)).toEqual({ locale: 'uz', audioLanguage: 'auto' });
		expect(await preferenceStore(db).get(99)).toEqual({ locale: 'en', audioLanguage: 'auto' });
	});
	it('exposes independent language commands, persistent settings buttons and a back button', async () => {
		const reply = vi.spyOn(Api.prototype, 'sendMessage').mockResolvedValue({ message_id: 9 } as TelegramMessage.TextMessage);
		await sendText('/settings');
		expect(reply.mock.calls.at(-1)?.[1]).toBe(`${text('en', 'settings')}\n\n${languageStatus('en', 'auto')}`);
		const options = reply.mock.calls.at(-1)?.[2];
		expect(options).toMatchObject({ reply_markup: { keyboard: [
			[{ text: text('en', 'menuUi') }], [{ text: text('en', 'menuInput') }], [{ text: text('en', 'menuUsage') }],
		], resize_keyboard: true } });
		expect(options).not.toMatchObject({ reply_markup: { one_time_keyboard: true } });
		expect(Api.prototype.setMyCommands).toHaveBeenCalledWith(expect.arrayContaining([
			expect.objectContaining({ command: 'menu_lang' }), expect.objectContaining({ command: 'audio_lang' }),
		]), { scope: { type: 'chat', chat_id: 2 } });
		await sendText('/menu_lang', 11);
		expect(reply.mock.calls.at(-1)?.[1]).toBe(`${text('en', 'chooseLanguage')}\n\n${languageStatus('en', 'auto')}`);
		await sendText('/audio_lang', 12);
		expect(reply.mock.calls.at(-1)?.[1]).toBe(`${text('en', 'chooseAudio')}\n\n${languageStatus('en', 'auto')}`);
		await sendText(text('en', 'menuBack'), 13);
		expect(reply.mock.calls.at(-1)?.[1]).toBe(`${text('en', 'settings')}\n\n${languageStatus('en', 'auto')}`);
		await sendText(text('en', 'menuUi'), 14);
		expect(reply.mock.calls.at(-1)?.[1]).toBe(`${text('en', 'chooseLanguage')}\n\n${languageStatus('en', 'auto')}`);
		await sendText(text('en', 'menuInput'), 15);
		expect(reply.mock.calls.at(-1)?.[1]).toBe(`${text('en', 'chooseAudio')}\n\n${languageStatus('en', 'auto')}`);
		expect(send).not.toHaveBeenCalled();
	});
	it('changing interface language preserves the previously chosen recording language and localizes menus', async () => {
		const reply = vi.spyOn(Api.prototype, 'sendMessage').mockResolvedValue({ message_id: 9 } as TelegramMessage.TextMessage);
		await preferenceStore(db).setAudioLanguage(2, 'en');
		await sendText('🇺🇿 Özbekcha');
		expect(await preferenceStore(db).get(2)).toEqual({ locale: 'uz', audioLanguage: 'en' });
		expect(reply.mock.calls.at(-1)?.[2]).toMatchObject({ reply_markup: { remove_keyboard: true } });
		await sendText('/audio_lang', 11);
		expect(reply.mock.calls.at(-1)?.[1]).toBe(`${text('uz', 'chooseAudio')}\n\n${languageStatus('uz', 'en')}`);
		expect(reply.mock.calls.at(-1)?.[2]).toMatchObject({ reply_markup: { keyboard: [
			[{ text: '🌐 Avtomatik' }], [{ text: '🎙 Özbekcha' }, { text: '🎙 Inglizcha' }],
			[{ text: '🎙 Ruscha' }], [{ text: text('uz', 'menuBack') }],
		] } });
		await sendText('🌐 Avtomatik', 12);
		expect(await preferenceStore(db).get(2)).toEqual({ locale: 'uz', audioLanguage: 'auto' });
	});
	it('shows helpful, localized instructions and privacy details', async () => {
		const reply = vi.spyOn(Api.prototype, 'sendMessage').mockResolvedValue({ message_id: 9 } as TelegramMessage.TextMessage);
		await preferenceStore(db).setLocale(2, 'uz');
		await sendText('hello');
		expect(reply.mock.calls.at(-1)?.[1]).toBe(text('uz', 'unsupported'));
		expect(reply.mock.calls.at(-1)?.[2]).toMatchObject({ reply_markup: { keyboard: [
			[{ text: text('uz', 'menuUi') }], [{ text: text('uz', 'menuInput') }], [{ text: text('uz', 'menuUsage') }],
		] } });
		await sendText('/privacy', 11);
		expect(reply.mock.calls.at(-1)?.[1]).toBe(text('uz', 'privacy'));
	});
	it('shows monthly usage and limits', async () => {
		const reply = vi.spyOn(Api.prototype, 'sendMessage').mockResolvedValue({ message_id: 9 } as TelegramMessage.TextMessage);
		await submitJob(bindings, { ...job, duration: 60 });
		await sendText('/usage', 11);
		expect(reply.mock.calls.at(-1)?.[1]).toBe(usageText('en', {
			audioSeconds: 60, transcriptions: 1, translations: 0,
		}, userQuotaLimits(bindings)));
		expect(reply.mock.calls.at(-1)?.[2]).toMatchObject({ reply_markup: { remove_keyboard: true } });
	});
	it('passes the recording language to Whisper, and localizes empty-speech feedback', async () => {
		const reply = vi.spyOn(Api.prototype, 'sendMessage').mockResolvedValue({ message_id: 9 } as TelegramMessage.TextMessage);
		vi.spyOn(Api.prototype, 'getFile').mockResolvedValue({ file_id: 'v', file_unique_id: 'u', file_path: 'voice/note.oga' });
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array([79, 103, 103, 83]))));
		run.mockResolvedValueOnce({ text: '' });
		const localizedJob: Job = { ...job, locale: 'uz', audioLanguage: 'en' };
		await submitJob(bindings, localizedJob);
		const delivery = batch();
		delivery.messages[0].body = localizedJob;
		await consume(delivery, bindings);
		expect(run).toHaveBeenCalledWith('@cf/openai/whisper-large-v3-turbo', expect.objectContaining({ language: 'en', task: 'transcribe' }));
		expect(reply.mock.calls.at(-1)?.[1]).toBe(text('uz', 'noSpeech'));
		expect(reply.mock.calls.at(-1)?.[2]).toMatchObject({ reply_markup: { remove_keyboard: true } });
	});
	it('honors the Whisper recording language without an Uzbek override or changing saved preferences', async () => {
		await preferenceStore(db).setAudioLanguage(2, 'en');
		vi.spyOn(Api.prototype, 'sendMessage').mockResolvedValue({ message_id: 9 } as TelegramMessage.TextMessage);
		vi.spyOn(Api.prototype, 'getFile').mockResolvedValue({ file_id: 'v', file_unique_id: 'u', file_path: 'voice/note.oga' });
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array([79, 103, 103, 83]))));
		const delivery = batch();
		delivery.messages[0].body = { ...job, audioLanguage: 'en' };
		await submitJob(bindings, delivery.messages[0].body);
		await consume(delivery, bindings);
		expect(run).toHaveBeenCalledWith('@cf/openai/whisper-large-v3-turbo', expect.objectContaining({
			language: 'en', task: 'transcribe',
		}));
		expect(run.mock.calls[0][1]).not.toHaveProperty('initial_prompt');
		expect(run.mock.calls[0][1]).not.toHaveProperty('beam_size');
		expect(await preferenceStore(db).get(2)).toEqual({ locale: 'en', audioLanguage: 'en' });
	});
	it('localizes shared-quota messages for queued jobs', async () => {
		const reply = vi.spyOn(Api.prototype, 'sendMessage').mockResolvedValue({ message_id: 9 } as TelegramMessage.TextMessage);
		const localizedJob: Job = { ...job, locale: 'uz' };
		await submitJob(bindings, localizedJob);
		const delivery = batch();
		delivery.messages[0].body = localizedJob;
		await consume(delivery, { ...bindings, GLOBAL_DAILY_AI_CALLS: '0' });
		expect(reply.mock.calls.at(-1)?.[1]).toBe(text('uz', 'dailyLimit'));
		expect(run).not.toHaveBeenCalled();
	});
});
