import type { BotEnv, Job } from './types';

export async function submitJob(env: BotEnv, job: Job): Promise<boolean> {
	const now = Date.now();
	// Single conditional insert serializes quota checks, including simultaneous requests.
	await env.DB.prepare(`INSERT OR IGNORE INTO jobs (id, user_id, created_at)
		SELECT ?1, ?2, ?3 WHERE (SELECT COUNT(*) FROM jobs WHERE user_id = ?2 AND created_at > ?4) < 5`)
		.bind(job.id, job.userId, now, now - 60_000).run();
	const row = await env.DB.prepare('SELECT status FROM jobs WHERE id = ?1').bind(job.id).first<{ status: string }>();
	if (!row) return false;
	// Resending a queued job repairs the insert/send gap if a webhook attempt failed.
	if (row.status === 'queued') await env.TRANSCRIPTIONS.send(job);
	return true;
}
