import { MAX_DURATION } from './audio';
import type { BotEnv, Job } from './types';
import { text } from './messages';

export const DAILY_LIMIT_MESSAGE = text('en', 'dailyLimit');

function limit(value: string | undefined, fallback: number): number {
	if (value === undefined) return fallback;
	const parsed = Number(value);
	// Fail closed on configuration errors; zero is an intentional kill switch.
	if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error('Invalid global quota configuration');
	return parsed;
}

export function quotaLimits(env: BotEnv) {
	return {
		seconds: limit(env.GLOBAL_DAILY_AUDIO_MINUTES, 180) * 60,
		calls: limit(env.GLOBAL_DAILY_AI_CALLS, 500),
	};
}

export function reservationSeconds(job: Job): number {
	// Legacy queued jobs and documents have no trusted duration: reserve the full
	// allowed length. Round known metadata upward, with a 10-second safety floor.
	return job.duration !== undefined && Number.isFinite(job.duration) && job.duration > 0
		? Math.max(10, Math.ceil(job.duration)) : MAX_DURATION;
}

export async function hasDailyCapacity(env: BotEnv, job: Job, now = new Date()): Promise<boolean> {
	const limits = quotaLimits(env);
	const usage = await env.DB.prepare('SELECT reserved_seconds, inference_calls FROM daily_ai_usage WHERE day = ?1')
		.bind(now.toISOString().slice(0, 10)).first<{ reserved_seconds: number; inference_calls: number }>();
	return (usage?.reserved_seconds ?? 0) + reservationSeconds(job) <= limits.seconds
		&& (usage?.inference_calls ?? 0) < limits.calls;
}

export async function reserveInference(env: BotEnv, job: Job, now = new Date()): Promise<boolean> {
	const limits = quotaLimits(env);
	const seconds = reservationSeconds(job);
	// One conditional UPSERT is the authoritative gate across concurrent Workers.
	// Count every inference attempt, including failures/timeouts; do not refund
	// uncertain usage. Delivery retries using a saved transcript never enter here.
	const result = await env.DB.prepare(`INSERT INTO daily_ai_usage (day, reserved_seconds, inference_calls)
		SELECT ?1, ?2, 1 WHERE ?2 <= ?3 AND ?4 > 0
		ON CONFLICT(day) DO UPDATE SET reserved_seconds = reserved_seconds + ?2, inference_calls = inference_calls + 1
		WHERE reserved_seconds + ?2 <= ?3 AND inference_calls < ?4`)
		.bind(now.toISOString().slice(0, 10), seconds, limits.seconds, limits.calls).run();
	return result.meta.changes === 1;
}

export async function accountForLongerAudio(env: BotEnv, job: Job, actualSeconds: number | undefined, day: Date) {
	if (actualSeconds === undefined || !Number.isFinite(actualSeconds)) return;
	const extra = Math.max(0, Math.ceil(actualSeconds) - reservationSeconds(job));
	if (extra > 0) {
		// The model reports duration only after inference. Record underestimates so
		// subsequent requests stop sooner; never refund short/silent recordings.
		await env.DB.prepare('UPDATE daily_ai_usage SET reserved_seconds = reserved_seconds + ?1 WHERE day = ?2')
			.bind(extra, day.toISOString().slice(0, 10)).run();
	}
}
