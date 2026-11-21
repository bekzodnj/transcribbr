import type { UserFromGetMe } from 'grammy/types';

export interface Job {
	id: number;
	chatId: number;
	messageId: number;
	userId: number;
	fileId: string;
	mimeType: string;
}

export interface BotEnv {
	BOT_TOKEN: string;
	WEBHOOK_SECRET: string;
	BOT_INFO: UserFromGetMe;
	AI: Ai;
	DB: D1Database;
	TRANSCRIPTIONS: Queue<Job>;
}
