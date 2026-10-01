import { createBot } from './bot';

const token = process.env.BOT_TOKEN;
if (!token) throw new Error('BOT_TOKEN is missing, add your dev bot token to .env');

const bot = createBot(token);

// Stop polling cleanly on Ctrl+C so Telegram doesn't keep the old connection open
process.once('SIGINT', () => bot.stop());
process.once('SIGTERM', () => bot.stop());

bot.start({
	onStart: (me) => console.log(`Polling as @${me.username}`),
});
