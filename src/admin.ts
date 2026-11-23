import type { BotEnv } from './types';

// Comma-separated Telegram user IDs configured in ADMIN_USER_IDS.
export function isAdmin(env: BotEnv | undefined, userId: number): boolean {
	return env?.ADMIN_USER_IDS?.split(',').some((id) => id.trim() === String(userId)) ?? false;
}
