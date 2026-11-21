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
	WHISPER_UZBEK_TEST?: string;
}
