import { Api, Keyboard } from 'grammy';
import { text, type Locale } from './messages';

// Not one-time: users can hide/reopen these controls with Telegram's keyboard icon.
export function settingsKeyboard(locale: Locale) {
	return new Keyboard().text(text(locale, 'menuUi')).row().text(text(locale, 'menuInput')).resized();
}

export function uiLanguageKeyboard(locale: Locale) {
	return new Keyboard().text('🇺🇿 Özbekcha').text('🇬🇧 English').row().text(text(locale, 'menuBack')).resized();
}

export function inputLanguageKeyboard(locale: Locale) {
	return new Keyboard().text(locale === 'uz' ? '🌐 Avtomatik' : '🌐 Automatic').row()
		.text(locale === 'uz' ? '🎙 Özbekcha' : '🎙 Uzbek').text(locale === 'uz' ? '🎙 Inglizcha' : '🎙 English')
		.row().text(text(locale, 'menuBack')).resized();
}

export async function syncCommandMenu(api: Api, chatId: number, locale: Locale) {
	const menuApi = new Api(api.token, { timeoutSeconds: 3 });
	try {
		await Promise.all([menuApi.setMyCommands([
			{ command: 'settings', description: locale === 'uz' ? 'Til sozlamalari' : 'Language settings' },
			{ command: 'menu_lang', description: locale === 'uz' ? 'Bot menyusi va xabarlari tili' : 'Menu and bot message language' },
			{ command: 'audio_lang', description: locale === 'uz' ? 'Ovozli yozuv tili' : 'Audio language' },
			{ command: 'help', description: locale === 'uz' ? 'Qanday foydalanish' : 'How to use this bot' },
			{ command: 'privacy', description: locale === 'uz' ? 'Maxfiylik' : 'Privacy' },
		], { scope: { type: 'chat', chat_id: chatId } }),
		menuApi.setChatMenuButton({ chat_id: chatId, menu_button: { type: 'commands' } })]);
	} catch {
		console.warn('Command menu could not be updated', { chatId });
	}
}
