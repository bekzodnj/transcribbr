import { InlineKeyboard } from 'grammy';
import { text, type Locale } from '../messages';

// The callback's message supplies its own ID and text; no text in callback_data.
export function translateKeyboard(locale: Locale) {
	return new InlineKeyboard().text(text(locale, 'translateButton'), 'translate');
}

export function translatingKeyboard(locale: Locale) {
	return new InlineKeyboard().text(text(locale, 'translatingButton'), 'translate:pending');
}
