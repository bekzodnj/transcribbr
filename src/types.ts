import type { UserFromGetMe } from 'grammy/types';

export interface Job {
	id: number;
	chatId: number;
	messageId: number;
	userId: number;
	fileId: string;
	mimeType: string;
	duration?: number;
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
}
