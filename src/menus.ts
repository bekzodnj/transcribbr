import { Api, Keyboard } from 'grammy';
import { text, type AudioLanguage, type Locale } from './messages';

const audioLabels: Record<Locale, Record<AudioLanguage, string>> = {
	en: { auto: '🌐 Automatic', uz: '🎙 Uzbek', en: '🎙 English', ru: '🎙 Russian' },
	uz: { auto: '🌐 Avtomatik', uz: '🎙 Özbekcha', en: '🎙 Inglizcha', ru: '🎙 Ruscha' },
	ru: { auto: '🌐 Авто', uz: '🎙 Узбекский', en: '🎙 Английский', ru: '🎙 Русский' },
};

const commands: Record<Locale, Record<'settings' | 'menu' | 'audio' | 'usage' | 'help' | 'privacy', string>> = {
	en: { settings: 'Language settings', menu: 'Menu and translation language', audio: 'Voice message language', usage: 'Monthly usage', help: 'How to use this bot', privacy: 'Privacy' },
	uz: { settings: 'Til sozlamalari', menu: 'Menyu va tarjima tili', audio: 'Ovoz xabar tili', usage: 'Oylik statistika', help: 'Qanday foydalanish', privacy: 'Maxfiylik' },
	ru: { settings: 'Языковые настройки', menu: 'Язык меню и перевода', audio: 'Язык голосовых сообщений', usage: 'Использование за месяц', help: 'Как пользоваться', privacy: 'Конфиденциальность' },
};

// Not one-time: users can hide/reopen these controls with Telegram's keyboard icon.
export function settingsKeyboard(locale: Locale) {
	return new Keyboard().text(text(locale, 'menuUi')).row().text(text(locale, 'menuInput'))
		.row().text(text(locale, 'menuUsage')).resized();
}

export function uiLanguageKeyboard(locale: Locale) {
	return new Keyboard().text('🇺🇿 Özbekcha').text('🇬🇧 English').row()
		.text('🇷🇺 Русский').row().text(text(locale, 'menuBack')).resized();
}

export function inputLanguageKeyboard(locale: Locale) {
	const labels = audioLabels[locale];
	return new Keyboard().text(labels.auto).row()
		.text(labels.uz).text(labels.en).row()
		.text(labels.ru).row().text(text(locale, 'menuBack')).resized();
}

export async function syncCommandMenu(api: Api, chatId: number, locale: Locale) {
	const menuApi = new Api(api.token, { timeoutSeconds: 3 });
	try {
		await Promise.all([menuApi.setMyCommands([
			{ command: 'settings', description: commands[locale].settings },
			{ command: 'menu_lang', description: commands[locale].menu },
			{ command: 'audio_lang', description: commands[locale].audio },
			{ command: 'usage', description: commands[locale].usage },
			{ command: 'help', description: commands[locale].help },
			{ command: 'privacy', description: commands[locale].privacy },
		], { scope: { type: 'chat', chat_id: chatId } }),
		menuApi.setChatMenuButton({ chat_id: chatId, menu_button: { type: 'commands' } })]);
	} catch {
		console.warn('Command menu could not be updated', { chatId });
	}
}
