import { webhookCallback } from 'grammy';
import { createBot } from './bot';
import { submitJob } from './jobs';
import { consume } from './transcription';
import type { BotEnv, Job } from './types';
import { preferenceStore } from './preferences';

export default {
	async fetch(request, env): Promise<Response> {
		const path = new URL(request.url).pathname;
		if (path === '/health' && request.method === 'GET') return new Response('OK');
		if (path !== '/webhook') return new Response('Not found', { status: 404 });
		if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
		if (!env.WEBHOOK_SECRET) return new Response('Webhook not configured', { status: 503 });
		if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.WEBHOOK_SECRET) {
			return new Response('Unauthorized', { status: 401 });
		}
		const bot = createBot(env.BOT_TOKEN, env.BOT_INFO, (job) => submitJob(env, job), preferenceStore(env.DB), env);
		try {
			return await webhookCallback(bot, 'cloudflare-mod', {
				secretToken: env.WEBHOOK_SECRET,
				// AI translation can outlive grammY's 10s default; Telegram allows up to 60s.
				timeoutMilliseconds: 30_000,
			})(request);
		} catch {
			// Do not log raw errors: request URLs can include the Telegram bot token.
			console.error('Webhook processing failed');
			return new Response('Please retry', { status: 503 });
		}
	},
	async queue(batch, env) {
		// Drain translation jobs left by the previous queued implementation.
		const messages = batch.messages.filter((message) => {
			if ((message.body as { kind?: string }).kind !== 'translation') return true;
			message.ack();
			return false;
		});
		if (messages.length) await consume({ ...batch, messages }, env);
	},
	async scheduled(_event, env) {
		const cutoff = new Date();
		cutoff.setUTCMonth(cutoff.getUTCMonth() - 12);
		await env.DB.batch([
			env.DB.prepare('DELETE FROM daily_ai_usage WHERE day < ?1').bind(new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)),
			env.DB.prepare('UPDATE jobs SET transcript = NULL WHERE created_at < ?1').bind(Date.now() - 86_400_000),
			env.DB.prepare('DELETE FROM jobs WHERE created_at < ?1').bind(Date.now() - 7 * 86_400_000),
			env.DB.prepare('DELETE FROM user_monthly_usage WHERE month < ?1').bind(cutoff.toISOString().slice(0, 7)),
		]);
	},
} satisfies ExportedHandler<BotEnv, Job>;
