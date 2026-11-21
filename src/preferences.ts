import type { AudioLanguage, Locale } from './messages';

export interface Preferences { locale: Locale; audioLanguage: AudioLanguage }
export interface PreferenceStore {
	get(userId: number): Promise<Preferences>;
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
