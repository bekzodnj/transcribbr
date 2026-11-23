import { env } from 'cloudflare:test';
import { Api } from 'grammy';
import type { Message as TelegramMessage } from 'grammy/types';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import jobsMigration from '../migrations/0001_jobs.sql?raw';
import quotaMigration from '../migrations/0002_global_usage.sql?raw';
import preferencesMigration from '../migrations/0003_user_preferences.sql?raw';
import translationsMigration from '../migrations/0004_translations.sql?raw';
import dropTranslationsMigration from '../migrations/0005_drop_translation_jobs.sql?raw';
import russianMigration from '../migrations/0006_russian_preferences.sql?raw';
import monthlyUsageMigration from '../migrations/0007_user_monthly_usage.sql?raw';
import dailyCounterMigration from '../migrations/0008_user_daily_counter.sql?raw';
import profileMigration from '../migrations/0009_user_profile.sql?raw';
import worker from '../src/index';
import { text, translationNotice } from '../src/messages';
import { preferenceStore } from '../src/preferences';
import { reserveTranslationCall } from '../src/quota';
import { translateText } from '../src/translation/model';
import type { TranslationRequest } from '../src/translation/types';
import type { BotEnv } from '../src/types';

const db = (env as unknown as BotEnv).DB;
const run = vi.fn();
const bindings = { ...env, DB: db, BOT_TOKEN: '123:test', WEBHOOK_SECRET: 'test-secret',
	TRANSCRIPTIONS: { send: vi.fn() }, AI: { run } } as unknown as BotEnv;
const request: TranslationRequest = { text: 'Hello, how are you?', targetLanguage: 'uz' };
const translated = (content: string | null, finish_reason = 'stop') => ({
	choices: [{ message: { role: 'assistant', content }, finish_reason }],
});

async function callback(data: string, source: Record<string, unknown> = {}, custom: BotEnv = bindings) {
	return worker.fetch(new Request('https://bot/webhook', {
		method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'test-secret' },
		body: JSON.stringify({ update_id: 123, callback_query: {
			id: 'callback-id', from: { id: 2, is_bot: false, first_name: 'Test' }, chat_instance: 'private', data,
			message: { message_id: 42, date: 1, chat: { id: 2, type: 'private', first_name: 'Test' },
				from: custom.BOT_INFO, text: request.text, ...source },
		} }),
	}), custom);
}

beforeAll(async () => {
	for (const sql of (jobsMigration + quotaMigration + preferencesMigration + translationsMigration
		+ dropTranslationsMigration + russianMigration + monthlyUsageMigration + dailyCounterMigration
		+ profileMigration).split(';').filter((sql) => sql.trim())) {
		await db.prepare(sql).run();
	}
});
beforeEach(async () => {
	await db.prepare('DELETE FROM daily_ai_usage').run();
	await db.prepare('DELETE FROM user_monthly_usage').run();
	await db.prepare('DELETE FROM user_preferences').run();
	run.mockReset().mockResolvedValue(translated('Salom, yaxshimisiz?'));
	vi.spyOn(Api.prototype, 'answerCallbackQuery').mockResolvedValue(true);
	vi.spyOn(Api.prototype, 'editMessageReplyMarkup').mockResolvedValue(true);
	vi.spyOn(Api.prototype, 'sendChatAction').mockResolvedValue(true);
	vi.spyOn(Api.prototype, 'sendMessage').mockResolvedValue({ message_id: 99 } as TelegramMessage.TextMessage);
});
afterEach(() => vi.restoreAllMocks());

describe('translate button', () => {
	it('translates the whole clicked message in one call, with thinking disabled and a loading button', async () => {
		await preferenceStore(db).setLocale(2, 'uz');
		const original = 'Özbekcha <text> & emoji 🎧\n'.repeat(140).padEnd(4_000, 'x');
		expect((await callback('translate', { text: original })).status).toBe(200);
		expect(Api.prototype.answerCallbackQuery).toHaveBeenCalledWith('callback-id', { text: text('uz', 'translating') }, undefined);
		expect(Api.prototype.editMessageReplyMarkup).toHaveBeenNthCalledWith(1, 2, 42, expect.objectContaining({
			reply_markup: { inline_keyboard: [[{ text: text('uz', 'translatingButton'), callback_data: 'translate:pending' }]] },
		}), undefined);
		expect(Api.prototype.editMessageReplyMarkup).toHaveBeenLastCalledWith(2, 42, expect.objectContaining({
			reply_markup: { inline_keyboard: [[{ text: text('uz', 'translateButton'), callback_data: 'translate' }]] },
		}), undefined);
		expect(Api.prototype.sendMessage).toHaveBeenNthCalledWith(1, 2, 'Salom, yaxshimisiz?', {
			reply_parameters: { message_id: 42, allow_sending_without_reply: true },
		}, undefined);
		expect(Api.prototype.sendMessage).toHaveBeenNthCalledWith(2, 2, translationNotice('uz'), expect.objectContaining({
			entities: [{ type: 'bot_command', offset: translationNotice('uz').indexOf('/menu_lang'), length: '/menu_lang'.length }],
		}), undefined);
		expect(run).toHaveBeenCalledExactlyOnceWith('@cf/google/gemma-4-26b-a4b-it', {
			stream: false,
			temperature: 0.1,
			chat_template_kwargs: { enable_thinking: false },
			messages: [
				{ role: 'system', content: expect.stringContaining('into Uzbek') },
				{ role: 'user', content: original },
			],
		}, { signal: expect.any(AbortSignal) });
	});
	it('keeps older source-picker buttons working by auto-detecting the source', async () => {
		await preferenceStore(db).setLocale(2, 'uz');
		await callback('translate:ru');
		expect(run).toHaveBeenCalledOnce();
		expect(Api.prototype.sendMessage).toHaveBeenNthCalledWith(1, 2, 'Salom, yaxshimisiz?', expect.anything(), undefined);
		expect(Api.prototype.sendMessage).toHaveBeenCalledTimes(2);
	});
	it('rejects inaccessible messages and non-bot sources without calling AI', async () => {
		await callback('translate', { text: undefined, date: 0 });
		await callback('translate', { chat: { id: 99, type: 'private' } });
		await callback('translate', { from: { id: 2, is_bot: false, first_name: 'Test' } });
		expect(run).not.toHaveBeenCalled();
		expect(Api.prototype.sendMessage).not.toHaveBeenCalled();
		expect(Api.prototype.answerCallbackQuery).toHaveBeenCalledWith('callback-id', expect.objectContaining({ show_alert: true }), undefined);
	});
	it('dismisses unknown buttons and the loading button without invoking AI', async () => {
		await callback('translate:xx');
		await callback('translate:pending');
		expect(run).not.toHaveBeenCalled();
		expect(Api.prototype.sendMessage).not.toHaveBeenCalled();
		expect(Api.prototype.answerCallbackQuery).toHaveBeenCalledTimes(2);
	});
	it('enforces the shared call budget without reserving audio minutes', async () => {
		const capped = { ...bindings, GLOBAL_DAILY_AI_CALLS: '1' };
		expect(await reserveTranslationCall(capped)).toBe(true);
		expect(await reserveTranslationCall(capped)).toBe(false);
		expect(await db.prepare('SELECT reserved_seconds, inference_calls FROM daily_ai_usage').first())
			.toEqual({ reserved_seconds: 0, inference_calls: 1 });
	});
	it('reports quota exhaustion without calling AI', async () => {
		await preferenceStore(db).setLocale(2, 'uz');
		const disabled = { ...bindings, GLOBAL_DAILY_AI_CALLS: '0' };
		const response = await worker.fetch(new Request('https://bot/webhook', {
			method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'test-secret' },
			body: JSON.stringify({ update_id: 1, callback_query: {
				id: 'callback-id', from: { id: 2, is_bot: false, first_name: 'Test' }, chat_instance: 'private', data: 'translate',
				message: { message_id: 42, date: 1, chat: { id: 2, type: 'private', first_name: 'Test' },
					from: disabled.BOT_INFO, text: request.text },
			} }),
		}), disabled);
		expect(response.status).toBe(200);
		expect(run).not.toHaveBeenCalled();
		expect(Api.prototype.sendMessage).toHaveBeenCalledExactlyOnceWith(2, text('uz', 'dailyLimit'), expect.anything(), undefined);
		expect(Api.prototype.editMessageReplyMarkup).toHaveBeenLastCalledWith(2, 42, expect.objectContaining({
			reply_markup: { inline_keyboard: [[{ text: text('uz', 'translateButton'), callback_data: 'translate' }]] },
		}), undefined);
	});
	it('reports the per-user monthly translation cap without calling AI', async () => {		await preferenceStore(db).setLocale(2, 'uz');
		const capped = { ...bindings, USER_MONTHLY_TRANSLATIONS: '0' };
		const response = await worker.fetch(new Request('https://bot/webhook', {
			method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': 'test-secret' },
			body: JSON.stringify({ update_id: 2, callback_query: {
				id: 'callback-id', from: { id: 2, is_bot: false, first_name: 'Test' }, chat_instance: 'private', data: 'translate',
				message: { message_id: 42, date: 1, chat: { id: 2, type: 'private', first_name: 'Test' },
					from: capped.BOT_INFO, text: request.text },
			} }),
		}), capped);
		expect(response.status).toBe(200);
		expect(run).not.toHaveBeenCalled();
		expect(Api.prototype.sendMessage).toHaveBeenCalledExactlyOnceWith(2, text('uz', 'monthlyLimit'), expect.anything(), undefined);
	});
	it('lets configured admins bypass the translation cap', async () => {
		await preferenceStore(db).setLocale(2, 'uz');
		const admin = { ...bindings, USER_MONTHLY_TRANSLATIONS: '0', ADMIN_USER_IDS: '2' };
		await callback('translate', {}, admin);
		expect(run).toHaveBeenCalledOnce();
		expect(Api.prototype.sendMessage).toHaveBeenNthCalledWith(1, 2, 'Salom, yaxshimisiz?', expect.anything(), undefined);
		expect(Api.prototype.sendMessage).toHaveBeenCalledTimes(2);
	});
	it('sends a localized error, restores the button, and logs only safe diagnostics', async () => {
		await preferenceStore(db).setLocale(2, 'uz');
		const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
		run.mockRejectedValueOnce(new Error('AiError: 3040: Capacity exceeded; transcript=private'));
		await callback('translate');
		expect(Api.prototype.sendMessage).toHaveBeenCalledExactlyOnceWith(2, text('uz', 'translationError'), expect.anything(), undefined);
		expect(log).toHaveBeenCalledWith('Direct translation failed', {
			targetLanguage: 'uz', inputLength: request.text.length,
			durationMs: expect.any(Number), reason: 'Translation inference failed (Workers AI code 3040)',
		});
		expect(JSON.stringify(log.mock.calls)).not.toContain('private');
		expect(Api.prototype.editMessageReplyMarkup).toHaveBeenLastCalledWith(2, 42, expect.objectContaining({
			reply_markup: { inline_keyboard: [[{ text: text('uz', 'translateButton'), callback_data: 'translate' }]] },
		}), undefined);
	});
});

describe('Gemma translation adapter', () => {
	it('rejects truncated, refused, and empty completions', async () => {
		for (const response of [
			translated('partial', 'length'),
			translated(null),
			{ choices: [{ message: { role: 'assistant', content: 'Hello', refusal: 'No' }, finish_reason: 'stop' }] },
			{},
		]) {
			run.mockResolvedValueOnce(response);
			await expect(translateText(bindings.AI, request)).rejects.toThrow(/Translation/);
		}
	});
	it('passes the full text with line breaks unchanged', async () => {
		const original = 'Hello world.\n'.repeat(300);
		await translateText(bindings.AI, { ...request, text: original });
		expect(run).toHaveBeenCalledExactlyOnceWith('@cf/google/gemma-4-26b-a4b-it', expect.objectContaining({
			chat_template_kwargs: { enable_thinking: false },
			messages: expect.arrayContaining([{ role: 'user', content: original }]),
		}), expect.anything());
	});
});
