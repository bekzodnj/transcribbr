import type { BotEnv, Job } from './types';
import { DAILY_LIMIT_MESSAGE, hasDailyCapacity } from './quota';

export async function submitJob(env: BotEnv, job: Job): Promise<boolean | string> {
	const now = Date.now();
	const existing = await env.DB.prepare('SELECT status FROM jobs WHERE id = ?1').bind(job.id).first<{ status: string }>();
	if (existing) {
		if (existing.status === 'queued') await env.TRANSCRIPTIONS.send(job);
		return true;
	}
	// Early rejection avoids downloading/enqueueing when already exhausted. The
	// consumer repeats the check atomically, so this read is not the spending gate.
	if (!await hasDailyCapacity(env, job)) return DAILY_LIMIT_MESSAGE;
	// Single conditional insert serializes quota checks, including simultaneous requests.
	await env.DB.prepare(`INSERT OR IGNORE INTO jobs (id, user_id, created_at)
		SELECT ?1, ?2, ?3 WHERE (SELECT COUNT(*) FROM jobs WHERE user_id = ?2 AND created_at > ?4) < 5
		AND (SELECT COUNT(*) FROM jobs WHERE status IN ('queued', 'processing', 'ready')) < 50`)
		.bind(job.id, job.userId, now, now - 60_000).run();
	const row = await env.DB.prepare('SELECT status FROM jobs WHERE id = ?1').bind(job.id).first<{ status: string }>();
	if (!row) return false;
	// Resending a queued job repairs the insert/send gap if a webhook attempt failed.
	if (row.status === 'queued') await env.TRANSCRIPTIONS.send(job);
	return true;
}
