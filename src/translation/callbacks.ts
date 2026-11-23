import type { Bot, Context } from 'grammy';
import { splitTranscript } from '../audio';
import { text, translationNotice } from '../messages';
import type { Preferences } from '../preferences';
import { isAdmin } from '../admin';
import { refundUserTranslation, reserveTranslationCall, reserveUserTranslation } from '../quota';
import type { BotEnv } from '../types';
import { translateKeyboard, translatingKeyboard } from './keyboards';
import { translateText, TranslationModelError } from './model';

type TranslationContext = Context & { preferences: Preferences };

export function registerTranslationCallbacks<C extends TranslationContext>(bot: Bot<C>, env?: BotEnv) {
	// Also accept callback data from earlier source-picker buttons already in chat.
	bot.callbackQuery(/^(?:transcript:echo|translate(?::(?:pick|en|ru|uz|pending))?)$/, async (ctx) => {
		const { locale } = ctx.preferences;
		if (ctx.callbackQuery.data === 'translate:pending') {
			await ctx.answerCallbackQuery();
			return;
		}
		const message = ctx.callbackQuery.message;
		// Only translate our own accessible messages in the user's DM.
		if (!message || message.chat.type !== 'private' || message.chat.id !== ctx.from.id
			|| !('text' in message) || !message.text?.trim() || message.text.length > 4_000
			|| message.from?.id !== ctx.me.id) {
			await ctx.answerCallbackQuery({ text: text(locale, 'translationUnavailable'), show_alert: true });
			return;
		}
		await ctx.answerCallbackQuery({ text: text(locale, 'translating') });
		const restore = () => ctx.editMessageReplyMarkup({ reply_markup: translateKeyboard(locale) }).catch(() => {});
		// Loading state on the button itself; failures here must not block translation.
		await ctx.editMessageReplyMarkup({ reply_markup: translatingKeyboard(locale) }).catch(() => {});
		const reply = { reply_parameters: { message_id: message.message_id, allow_sending_without_reply: true as const } };
		const started = Date.now();
		try {
			if (!env) throw new Error('Translation is not configured');
			if (!isAdmin(env, ctx.from.id) && !await reserveUserTranslation(env, ctx.from.id)) {
				await ctx.reply(text(locale, 'monthlyLimit'), reply);
				return;
			}
			if (!await reserveTranslationCall(env)) {
				await refundUserTranslation(env, ctx.from.id);
				await ctx.reply(text(locale, 'dailyLimit'), reply);
				return;
			}
			await ctx.replyWithChatAction('typing').catch(() => {});
			const translation = await translateText(env.AI, { text: message.text, targetLanguage: locale });
			for (const chunk of splitTranscript(translation)) await ctx.reply(chunk, reply);
			const notice = translationNotice(locale);
			await ctx.reply(notice, { entities: [
				{ type: 'bot_command', offset: notice.indexOf('/menu_lang'), length: '/menu_lang'.length },
			] }).catch(() => {});
		} catch (error) {
			const reason = error instanceof TranslationModelError ? error.message : 'Translation unavailable';
			console.warn('Direct translation failed', {
				targetLanguage: locale, inputLength: message.text.length, durationMs: Date.now() - started, reason,
			});
			await ctx.reply(text(locale, 'translationError'), reply).catch(() => {});
		} finally {
			await restore();
		}
	});
	// Always dismiss spinners for obsolete/unknown buttons, without invoking AI.
	bot.on('callback_query:data', (ctx) => ctx.answerCallbackQuery());
}
