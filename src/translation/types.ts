import type { Locale } from '../messages';

export interface TranslationRequest {
	text: string;
	targetLanguage: Locale;
}
