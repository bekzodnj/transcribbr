import { Bot, Keyboard } from 'grammy';
import type { UserFromGetMe } from 'grammy/types';
import { getAudio, MAX_BYTES, MAX_DURATION } from './audio';
import { text, type AudioLanguage, type Locale } from './messages';
import type { PreferenceStore } from './preferences';
import { DAILY_LIMIT_MESSAGE } from './quota';
import type { Job } from './types';

const replyLanguages = { '🇺🇿 O‘zbekcha': 'uz', '🇬🇧 English': 'en' } as const;
const recordingLanguages: Record<string, AudioLanguage> = {
	'🌐 Automatic': 'auto', '🌐 Avtomatik': 'auto',
	'🎙 Uzbek': 'uz', '🎙 O‘zbekcha': 'uz', '🎙 English': 'en', '🎙 Inglizcha': 'en',
};
function replyKeyboard() {
	return new Keyboard().text('🇺🇿 O‘zbekcha').text('🇬🇧 English').resized().oneTime();
}
function audioKeyboard(locale: Locale) {
	return new Keyboard().text(locale === 'uz' ? '🌐 Avtomatik' : '🌐 Automatic').row()
		.text(locale === 'uz' ? '🎙 O‘zbekcha' : '🎙 Uzbek').text(locale === 'uz' ? '🎙 Inglizcha' : '🎙 English')
		.resized().oneTime();
}

export function createBot(token: string, botInfo?: UserFromGetMe,
	submit?: (job: Job) => Promise<boolean | string>, preferences?: PreferenceStore) {
	const bot = new Bot(token, { botInfo });
	const getPreferences = (userId: number) => preferences?.get(userId) ?? Promise.resolve({ locale: 'en' as const, audioLanguage: 'auto' as const });
	bot.use(async (ctx, next) => {
		if (ctx.chat?.type === 'private') await next();
	});

	bot.command('start', async (ctx) => {
		const { locale } = await getPreferences(ctx.from!.id);
		await ctx.reply(text(locale, 'welcome'), { reply_markup: replyKeyboard() });
	});
	bot.command('language', async (ctx) => {
		const { locale } = await getPreferences(ctx.from!.id);
		await ctx.reply(text(locale, 'chooseLanguage'), { reply_markup: replyKeyboard() });
	});
	bot.command('audio_language', async (ctx) => {
		const { locale } = await getPreferences(ctx.from!.id);
		await ctx.reply(text(locale, 'chooseAudio'), { reply_markup: audioKeyboard(locale) });
	});
	bot.command(['help', 'privacy'], async (ctx) => {
		const { locale } = await getPreferences(ctx.from!.id);
		await ctx.reply(text(locale, ctx.msg.text.startsWith('/privacy') ? 'privacy' : 'ready'));
	});
	bot.hears(Object.keys(replyLanguages), async (ctx) => {
		if (!ctx.from || !ctx.msg.text) return;
		const locale = replyLanguages[ctx.msg.text as keyof typeof replyLanguages];
		if (!preferences) { await ctx.reply(text(locale, 'processingError')); return; }
		await preferences.setLocale(ctx.from.id, locale);
		await ctx.reply(text(locale, 'ready'));
		await ctx.reply(text(locale, 'chooseAudio'), { reply_markup: audioKeyboard(locale) });
	});
	bot.hears(Object.keys(recordingLanguages), async (ctx) => {
		if (!ctx.from || !ctx.msg.text) return;
		const { locale } = await getPreferences(ctx.from.id);
		if (!preferences) { await ctx.reply(text(locale, 'processingError')); return; }
		await preferences.setAudioLanguage(ctx.from.id, recordingLanguages[ctx.msg.text]);
		await ctx.reply(text(locale, 'audioSaved'), { reply_markup: { remove_keyboard: true } });
	});
	bot.on('message', async (ctx) => {
		const { locale, audioLanguage } = await getPreferences(ctx.from.id);
		const audio = getAudio(ctx.msg);
		if (!audio) { await ctx.reply(text(locale, 'unsupported')); return; }
		if ((audio.fileSize ?? 0) > MAX_BYTES || (audio.duration ?? 0) > MAX_DURATION) {
			await ctx.reply(text(locale, 'tooLarge')); return;
		}
		if (!submit) { await ctx.reply(text(locale, 'processingError')); return; }
		const accepted = await submit({
			id: ctx.update.update_id, chatId: ctx.chat.id, messageId: ctx.msg.message_id,
			userId: ctx.from.id, fileId: audio.fileId, mimeType: audio.mimeType,
			locale, audioLanguage,
			...(audio.duration === undefined ? {} : { duration: audio.duration }),
		});
		if (accepted === 'duplicate') return;
		if (accepted !== true) {
			await ctx.reply(text(locale, accepted === DAILY_LIMIT_MESSAGE ? 'dailyLimit' : 'busy'));
			return;
		}
		// Acknowledgment is best effort: failure must not retry an already queued job.
		try {
			await ctx.reply(text(locale, 'received'), { reply_parameters: { message_id: ctx.msg.message_id }, reply_markup: { remove_keyboard: true } });
		} catch {
			console.warn('Recording acknowledgment could not be delivered', { jobId: ctx.update.update_id });
		}
	});
	return bot;
}
