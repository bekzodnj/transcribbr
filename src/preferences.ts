import type { AudioLanguage, Locale } from './messages';

export interface Preferences { locale: Locale; audioLanguage: AudioLanguage }
export interface TelegramProfile {
	id: number;
	first_name: string;
	last_name?: string;
	username?: string;
}
export interface PreferenceStore {
	get(userId: number): Promise<Preferences>;
	touch(user: TelegramProfile): Promise<void>;
	setLocale(userId: number, locale: Locale): Promise<void>;
	setAudioLanguage(userId: number, language: AudioLanguage): Promise<void>;
}

export function preferenceStore(db: D1Database): PreferenceStore {
	return {
		async get(userId) {
			const row = await db.prepare('SELECT locale, audio_language FROM user_preferences WHERE user_id = ?1')
				.bind(userId).first<{ locale: Locale; audio_language: AudioLanguage }>();
			return { locale: row?.locale ?? 'en', audioLanguage: row?.audio_language ?? 'auto' };
		},
		async touch(user) {
			// Keeps a current display name/username without a second table or a read.
			await db.prepare(`INSERT INTO user_preferences (user_id, first_name, last_name, username, updated_at)
				VALUES (?1, ?2, ?3, ?4, ?5)
				ON CONFLICT(user_id) DO UPDATE SET
					first_name = excluded.first_name, last_name = excluded.last_name,
					username = excluded.username, updated_at = excluded.updated_at`)
				.bind(user.id, user.first_name, user.last_name ?? null, user.username ?? null, Date.now()).run();
		},
		async setLocale(userId, locale) {
			await db.prepare(`INSERT INTO user_preferences (user_id, locale) VALUES (?1, ?2)
				ON CONFLICT(user_id) DO UPDATE SET locale = excluded.locale`).bind(userId, locale).run();
		},
		async setAudioLanguage(userId, language) {
			await db.prepare(`INSERT INTO user_preferences (user_id, audio_language) VALUES (?1, ?2)
				ON CONFLICT(user_id) DO UPDATE SET audio_language = excluded.audio_language`).bind(userId, language).run();
		},
	};
}
