import { Bot, Context } from 'grammy';
import type { UserFromGetMe } from 'grammy/types';

export function createBot(token: string, botInfo?: UserFromGetMe) {
	const bot = new Bot(token, { botInfo });

	bot.command('start', async (ctx: Context) => {
		await ctx.reply('Hello! I am your friendly bot. How can I assist you today?');
	});
	bot.hears(/hello/i, async (ctx: Context) => {
		await ctx.reply('Hello there! How can I help you?');
	});
	bot.on('message', async (ctx: Context) => {
		await ctx.reply('I received your message!');
	});

	return bot;
}
