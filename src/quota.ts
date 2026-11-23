import { MAX_DURATION } from './audio';
import type { BotEnv, Job } from './types';
import { text } from './messages';

export const DAILY_LIMIT_MESSAGE = text('en', 'dailyLimit');
export const USER_LIMIT_MESSAGE = 'user-limit';

function limit(value: string | undefined, fallback: number): number {
	if (value === undefined) return fallback;
	const parsed = Number(value);
	// Fail closed on configuration errors; zero is an intentional kill switch.
	if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error('Invalid quota configuration');
	return parsed;
}

export function quotaLimits(env: BotEnv) {
	return {
		seconds: limit(env.GLOBAL_DAILY_AUDIO_MINUTES, 1200) * 60,
		calls: limit(env.GLOBAL_DAILY_AI_CALLS, 1000),
		monthlySeconds: limit(env.GLOBAL_MONTHLY_AUDIO_MINUTES, 20000) * 60,
		monthlyCalls: limit(env.GLOBAL_MONTHLY_AI_CALLS, 20000),
	};
}

export function userQuotaLimits(env: BotEnv) {
	return {
		seconds: limit(env.USER_MONTHLY_AUDIO_MINUTES, 60) * 60,
		transcriptions: limit(env.USER_MONTHLY_TRANSCRIPTIONS, 100),
		translations: limit(env.USER_MONTHLY_TRANSLATIONS, 200),
		dailyTranscriptions: limit(env.USER_DAILY_TRANSCRIPTIONS, 10),
	};
}

const dayKey = (now: Date) => now.toISOString().slice(0, 10);
const monthKey = (now: Date) => now.toISOString().slice(0, 7);
const monthStart = (now: Date) => `${monthKey(now)}-01`;

export function reservationSeconds(job: Job): number {
	// Legacy queued jobs and documents have no trusted duration: reserve the full
	// allowed length. Round known metadata upward, with a 10-second safety floor.
	return job.duration !== undefined && Number.isFinite(job.duration) && job.duration > 0
		? Math.max(10, Math.ceil(job.duration)) : MAX_DURATION;
}

interface GlobalUsage {
	day_seconds: number; day_calls: number; month_seconds: number; month_calls: number;
}

async function globalUsage(env: BotEnv, now: Date): Promise<GlobalUsage> {
	const row = await env.DB.prepare(`SELECT
		(SELECT COALESCE(reserved_seconds, 0) FROM daily_ai_usage WHERE day = ?1) AS day_seconds,
		(SELECT COALESCE(inference_calls, 0) FROM daily_ai_usage WHERE day = ?1) AS day_calls,
		(SELECT COALESCE(SUM(reserved_seconds), 0) FROM daily_ai_usage WHERE day >= ?2 AND day <= ?1) AS month_seconds,
		(SELECT COALESCE(SUM(inference_calls), 0) FROM daily_ai_usage WHERE day >= ?2 AND day <= ?1) AS month_calls`)
		.bind(dayKey(now), monthStart(now)).first<GlobalUsage>();
	return row ?? { day_seconds: 0, day_calls: 0, month_seconds: 0, month_calls: 0 };
}

export async function hasDailyCapacity(env: BotEnv, job: Job, now = new Date()): Promise<boolean> {
	const limits = quotaLimits(env);
	const usage = await globalUsage(env, now);
	return usage.day_seconds + reservationSeconds(job) <= limits.seconds
		&& usage.day_calls < limits.calls
		&& usage.month_seconds + reservationSeconds(job) <= limits.monthlySeconds
		&& usage.month_calls < limits.monthlyCalls;
}

export async function reserveInference(env: BotEnv, job: Job, now = new Date()): Promise<boolean> {
	const limits = quotaLimits(env);
	const seconds = reservationSeconds(job);
	// One conditional UPSERT is the authoritative gate across concurrent Workers.
	// Count every inference attempt, including failures/timeouts; do not refund
	// uncertain usage. Delivery retries using a saved transcript never enter here.
	const result = await env.DB.prepare(`INSERT INTO daily_ai_usage (day, reserved_seconds, inference_calls)
		SELECT ?1, ?2, 1
		WHERE ?4 > 0 AND ?2 <= ?3
			AND (SELECT COALESCE(SUM(reserved_seconds), 0) FROM daily_ai_usage WHERE day >= ?5 AND day <= ?1) + ?2 <= ?6
			AND (SELECT COALESCE(SUM(inference_calls), 0) FROM daily_ai_usage WHERE day >= ?5 AND day <= ?1) + 1 <= ?7
		ON CONFLICT(day) DO UPDATE SET reserved_seconds = reserved_seconds + ?2, inference_calls = inference_calls + 1
		WHERE reserved_seconds + ?2 <= ?3 AND inference_calls < ?4
			AND (SELECT COALESCE(SUM(reserved_seconds), 0) FROM daily_ai_usage WHERE day >= ?5 AND day <= ?1) + ?2 <= ?6
			AND (SELECT COALESCE(SUM(inference_calls), 0) FROM daily_ai_usage WHERE day >= ?5 AND day <= ?1) + 1 <= ?7`)
		.bind(dayKey(now), seconds, limits.seconds, limits.calls, monthStart(now), limits.monthlySeconds, limits.monthlyCalls)
		.run();
	return result.meta.changes === 1;
}

// Translation shares the call budget but is text-only, so reserve no audio time.
export async function reserveTranslationCall(env: BotEnv, now = new Date()): Promise<boolean> {
	const limits = quotaLimits(env);
	const result = await env.DB.prepare(`INSERT INTO daily_ai_usage (day, reserved_seconds, inference_calls)
		SELECT ?1, 0, 1
		WHERE ?2 > 0
			AND (SELECT COALESCE(SUM(inference_calls), 0) FROM daily_ai_usage WHERE day >= ?3 AND day <= ?1) + 1 <= ?4
		ON CONFLICT(day) DO UPDATE SET inference_calls = inference_calls + 1
		WHERE inference_calls < ?2
			AND (SELECT COALESCE(SUM(inference_calls), 0) FROM daily_ai_usage WHERE day >= ?3 AND day <= ?1) + 1 <= ?4`)
		.bind(dayKey(now), limits.calls, monthStart(now), limits.monthlyCalls).run();
	return result.meta.changes === 1;
}

interface UserUsage {
	audio_seconds: number; transcription_calls: number; translation_calls: number;
	day: string; day_calls: number;
}

export async function userUsage(env: BotEnv, userId: number, now = new Date()): Promise<UserUsage> {
	const row = await env.DB.prepare(`SELECT audio_seconds, transcription_calls, translation_calls, day, day_calls
		FROM user_monthly_usage WHERE user_id = ?1 AND month = ?2`)
		.bind(userId, monthKey(now)).first<UserUsage>();
	return row ?? { audio_seconds: 0, transcription_calls: 0, translation_calls: 0, day: '', day_calls: 0 };
}

export async function hasUserCapacity(env: BotEnv, job: Job, now = new Date()): Promise<boolean> {
	const limits = userQuotaLimits(env);
	const usage = await userUsage(env, job.userId, now);
	const todayCalls = usage.day === dayKey(now) ? usage.day_calls : 0;
	return usage.audio_seconds + reservationSeconds(job) <= limits.seconds
		&& usage.transcription_calls < limits.transcriptions
		&& todayCalls < limits.dailyTranscriptions;
}

// Charges the per-user monthly allowance once, at admission.
export async function reserveUserTranscription(env: BotEnv, job: Job, now = new Date()): Promise<boolean> {
	const limits = userQuotaLimits(env);
	const seconds = reservationSeconds(job);
	const result = await env.DB.prepare(`INSERT INTO user_monthly_usage
			(user_id, month, audio_seconds, transcription_calls, day, day_calls)
		SELECT ?1, ?2, ?3, 1, ?7, 1
		WHERE ?3 <= ?4 AND ?6 > 0
		ON CONFLICT(user_id, month) DO UPDATE SET
			audio_seconds = audio_seconds + ?3,
			transcription_calls = transcription_calls + 1,
			day = ?7,
			day_calls = CASE WHEN day = ?7 THEN day_calls + 1 ELSE 1 END
		WHERE audio_seconds + ?3 <= ?4 AND transcription_calls < ?5
			AND (day <> ?7 OR day_calls < ?6)`)
		.bind(job.userId, monthKey(now), seconds, limits.seconds, limits.transcriptions,
			limits.dailyTranscriptions, dayKey(now))
		.run();
	return result.meta.changes === 1;
}

export async function reserveUserTranslation(env: BotEnv, userId: number, now = new Date()): Promise<boolean> {
	const { translations } = userQuotaLimits(env);
	const result = await env.DB.prepare(`INSERT INTO user_monthly_usage (user_id, month, translation_calls)
		SELECT ?1, ?2, 1 WHERE ?3 > 0
		ON CONFLICT(user_id, month) DO UPDATE SET translation_calls = translation_calls + 1
		WHERE translation_calls < ?3`)
		.bind(userId, monthKey(now), translations).run();
	return result.meta.changes === 1;
}

export async function refundUserTranslation(env: BotEnv, userId: number, now = new Date()) {
	await env.DB.prepare(`UPDATE user_monthly_usage SET translation_calls = translation_calls - 1
		WHERE user_id = ?1 AND month = ?2 AND translation_calls > 0`).bind(userId, monthKey(now)).run();
}

export async function accountForLongerAudio(env: BotEnv, job: Job, actualSeconds: number | undefined, day: Date) {
	if (actualSeconds === undefined || !Number.isFinite(actualSeconds)) return;
	const extra = Math.max(0, Math.ceil(actualSeconds) - reservationSeconds(job));
	if (extra > 0) {
		// The model reports duration only after inference. Record underestimates so
		// subsequent requests stop sooner; never refund short/silent recordings.
		await env.DB.batch([
			env.DB.prepare('UPDATE daily_ai_usage SET reserved_seconds = reserved_seconds + ?1 WHERE day = ?2')
				.bind(extra, dayKey(day)),
			env.DB.prepare('UPDATE user_monthly_usage SET audio_seconds = audio_seconds + ?1 WHERE user_id = ?2 AND month = ?3')
				.bind(extra, job.userId, monthKey(day)),
		]);
	}
}
