import { Bot, type Context } from 'grammy';
import type { UserFromGetMe } from 'grammy/types';
import { getAudio, MAX_BYTES, MAX_DURATION } from './audio';
import { text, languageStatus, usageText, LOCALES, type AudioLanguage } from './messages';
import type { Preferences, PreferenceStore } from './preferences';
import { DAILY_LIMIT_MESSAGE, USER_LIMIT_MESSAGE, userQuotaLimits, userUsage } from './quota';
import { isAdmin } from './admin';
import type { BotEnv, Job } from './types';
import { inputLanguageKeyboard, settingsKeyboard, syncCommandMenu, uiLanguageKeyboard } from './menus';
import { registerTranslationCallbacks } from './translation/callbacks';

const replyLanguages = { '🇺🇿 Özbekcha': 'uz', '🇬🇧 English': 'en', '🇷🇺 Русский': 'ru' } as const;
const recordingLanguages: Record<string, AudioLanguage> = {
	'🌐 Automatic': 'auto', '🌐 Avtomatik': 'auto', '🌐 Авто': 'auto',
	'🎙 Uzbek': 'uz', '🎙 Özbekcha': 'uz', '🎙 Узбекский': 'uz',
	'🎙 English': 'en', '🎙 Inglizcha': 'en', '🎙 Английский': 'en',
	'🎙 Russian': 'ru', '🎙 Ruscha': 'ru', '🎙 Русский': 'ru',
};
type BotContext = Context & { preferences: Preferences };

export function createBot(token: string, botInfo?: UserFromGetMe,
	submit?: (job: Job) => Promise<boolean | string>, preferences?: PreferenceStore, env?: BotEnv) {
	const bot = new Bot<BotContext>(token, { botInfo });
	bot.use(async (ctx, next) => {
		if (ctx.chat?.type !== 'private' || !ctx.from) return;
		// Per-update context, not in-memory sessions: D1 stays the source of truth.
		ctx.preferences = await (preferences?.get(ctx.from.id) ?? { locale: 'en', audioLanguage: 'auto' });
		await preferences?.touch?.(ctx.from);
		await next();
	});
	registerTranslationCallbacks(bot, env);
	const status = (ctx: BotContext) => languageStatus(ctx.preferences.locale, ctx.preferences.audioLanguage);
	const showUiLanguage = (ctx: BotContext) => ctx.reply(
		`${text(ctx.preferences.locale, 'chooseLanguage')}\n\n${status(ctx)}`,
		{ reply_markup: uiLanguageKeyboard(ctx.preferences.locale) },
	);
	const showInputLanguage = (ctx: BotContext) => ctx.reply(
		`${text(ctx.preferences.locale, 'chooseAudio')}\n\n${status(ctx)}`,
		{ reply_markup: inputLanguageKeyboard(ctx.preferences.locale) },
	);
	const showSettings = (ctx: BotContext) => ctx.reply(
		`${text(ctx.preferences.locale, 'settings')}\n\n${status(ctx)}`,
		{ reply_markup: settingsKeyboard(ctx.preferences.locale) },
	);
	const showUsage = async (ctx: BotContext) => {
		const { locale } = ctx.preferences;
		if (!env) { await ctx.reply(text(locale, 'processingError')); return; }
		const used = await userUsage(env, ctx.from!.id);
		const limits = userQuotaLimits(env);
		await ctx.reply(usageText(locale, {
			audioSeconds: used.audio_seconds, transcriptions: used.transcription_calls, translations: used.translation_calls,
		}, limits, isAdmin(env, ctx.from!.id)), { reply_markup: { remove_keyboard: true } });
	};

	bot.command('start', async (ctx) => {
		const { locale } = ctx.preferences;
		await ctx.reply(text(locale, 'welcome'), { reply_markup: uiLanguageKeyboard(locale) });
		await syncCommandMenu(ctx.api, ctx.chat.id, locale);
	});
	bot.command(['menu_lang', 'ui_lang', 'language'], showUiLanguage);
	bot.command(['audio_lang', 'input_lang', 'audio_language'], showInputLanguage);
	bot.command('settings', async (ctx) => {
		await showSettings(ctx);
		await syncCommandMenu(ctx.api, ctx.chat.id, ctx.preferences.locale);
	});
	bot.command('usage', showUsage);
	bot.hears(LOCALES.map((locale) => text(locale, 'menuUsage')), showUsage);
	bot.hears(LOCALES.map((locale) => text(locale, 'menuUi')), showUiLanguage);
	bot.hears(LOCALES.map((locale) => text(locale, 'menuInput')), showInputLanguage);
	bot.hears(LOCALES.map((locale) => text(locale, 'menuBack')), showSettings);
	bot.command(['help', 'privacy'], async (ctx) => {
		const { locale } = ctx.preferences;
		await ctx.reply(text(locale, ctx.hasCommand('privacy') ? 'privacy' : 'ready'), { reply_markup: { remove_keyboard: true } });
	});
	bot.hears(Object.keys(replyLanguages), async (ctx) => {
		if (!ctx.from || !ctx.msg.text) return;
		const locale = replyLanguages[ctx.msg.text as keyof typeof replyLanguages];
		if (!preferences) { await ctx.reply(text(locale, 'processingError')); return; }
		await preferences.setLocale(ctx.from.id, locale);
		ctx.preferences.locale = locale;
		await ctx.reply(text(locale, 'uiSaved'), { reply_markup: { remove_keyboard: true } });
		await syncCommandMenu(ctx.api, ctx.chat.id, locale);
	});
	bot.hears(Object.keys(recordingLanguages), async (ctx) => {
		if (!ctx.from || !ctx.msg.text) return;
		const { locale } = ctx.preferences;
		if (!preferences) { await ctx.reply(text(locale, 'processingError')); return; }
		await preferences.setAudioLanguage(ctx.from.id, recordingLanguages[ctx.msg.text]);
		ctx.preferences.audioLanguage = recordingLanguages[ctx.msg.text];
		await ctx.reply(text(locale, 'audioSaved'), { reply_markup: { remove_keyboard: true } });
	});
	bot.on('message', async (ctx) => {
		const { locale, audioLanguage } = ctx.preferences;
		const audio = getAudio(ctx.msg);
		if (!audio) {
			await ctx.reply(text(locale, 'unsupported'), {
				reply_markup: ctx.msg.text ? settingsKeyboard(locale) : { remove_keyboard: true },
			});
			return;
		}
		if ((audio.fileSize ?? 0) > MAX_BYTES) {
			await ctx.reply(text(locale, 'tooLarge'), { reply_markup: { remove_keyboard: true } }); return;
		}
		if ((audio.duration ?? 0) > MAX_DURATION) {
			await ctx.reply(text(locale, 'tooLong'), { reply_markup: { remove_keyboard: true } }); return;
		}
		if (!submit) { await ctx.reply(text(locale, 'processingError'), { reply_markup: { remove_keyboard: true } }); return; }
		const accepted = await submit({
			id: ctx.update.update_id, chatId: ctx.chat.id, messageId: ctx.msg.message_id,
			userId: ctx.from.id, fileId: audio.fileId, mimeType: audio.mimeType,
			locale, audioLanguage,
			...(audio.duration === undefined ? {} : { duration: audio.duration }),
		});
		if (accepted === 'duplicate') return;
		if (accepted !== true) {
			const key = accepted === DAILY_LIMIT_MESSAGE ? 'dailyLimit'
				: accepted === USER_LIMIT_MESSAGE ? 'monthlyLimit' : 'busy';
			await ctx.reply(text(locale, key), { reply_markup: { remove_keyboard: true } });
			return;
		}
		// Best effort: an acknowledgment failure must not retry an already queued job.
		try {
			const acknowledgment = text(locale, 'received');
			await ctx.reply(acknowledgment, {
				entities: [{ type: 'italic', offset: 0, length: acknowledgment.length }],
				reply_parameters: { message_id: ctx.msg.message_id, allow_sending_without_reply: true },
				reply_markup: { remove_keyboard: true },
			});
		} catch {
			console.warn('Recording acknowledgment could not be delivered', { jobId: ctx.update.update_id });
		}
	});
	return bot;
}
