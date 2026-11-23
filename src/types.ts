import type { UserFromGetMe } from 'grammy/types';
import type { AudioLanguage, Locale } from './messages';

export interface Job {
	id: number;
	chatId: number;
	messageId: number;
	userId: number;
	fileId: string;
	mimeType: string;
	duration?: number;
	locale?: Locale;
	audioLanguage?: AudioLanguage;
}

export interface BotEnv {
	BOT_TOKEN: string;
	WEBHOOK_SECRET: string;
	BOT_INFO: UserFromGetMe;
	AI: Ai;
	DB: D1Database;
	TRANSCRIPTIONS: Queue<Job>;
	GLOBAL_DAILY_AUDIO_MINUTES?: string;
	GLOBAL_DAILY_AI_CALLS?: string;
	GLOBAL_MONTHLY_AUDIO_MINUTES?: string;
	GLOBAL_MONTHLY_AI_CALLS?: string;
	USER_MONTHLY_AUDIO_MINUTES?: string;
	USER_MONTHLY_TRANSCRIPTIONS?: string;
	USER_MONTHLY_TRANSLATIONS?: string;
	USER_DAILY_TRANSCRIPTIONS?: string;
	ADMIN_USER_IDS?: string;
	GEMINI_TRANSCRIBE_TEST?: string;
	GEMINI_API_KEY?: string;
}
