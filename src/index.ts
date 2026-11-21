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
		const bot = createBot(env.BOT_TOKEN, env.BOT_INFO, (job) => submitJob(env, job), preferenceStore(env.DB));
		try {
			return await webhookCallback(bot, 'cloudflare-mod', { secretToken: env.WEBHOOK_SECRET })(request);
		} catch {
			// Do not log raw errors: request URLs can include the Telegram bot token.
			console.error('Webhook processing failed');
			return new Response('Please retry', { status: 503 });
		}
	},
	async queue(batch, env) {
		await consume(batch, env);
	},
	async scheduled(_event, env) {
		await env.DB.batch([
			env.DB.prepare('DELETE FROM daily_ai_usage WHERE day < ?1').bind(new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)),
			env.DB.prepare('UPDATE jobs SET transcript = NULL WHERE created_at < ?1').bind(Date.now() - 86_400_000),
			env.DB.prepare('DELETE FROM jobs WHERE created_at < ?1').bind(Date.now() - 7 * 86_400_000),
		]);
	},
} satisfies ExportedHandler<BotEnv, Job>;
