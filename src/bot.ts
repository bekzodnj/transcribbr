import { Bot } from 'grammy';
import type { UserFromGetMe } from 'grammy/types';
import { getAudio, MAX_BYTES, MAX_DURATION } from './audio';
import type { Job } from './types';

export function createBot(token: string, botInfo?: UserFromGetMe, submit?: (job: Job) => Promise<boolean | string>) {
	const bot = new Bot(token, { botInfo });

	bot.command('start', async (ctx) => {
		await ctx.reply('Send or forward a voice note or audio file (up to 10 minutes / 20 MB). I transcribe it using Cloudflare Workers AI. Audio is not stored by this app; temporary transcripts are deleted after delivery or after about one day.');
	});

	bot.on('message', async (ctx) => {
		if (ctx.chat.type !== 'private') return;
		const audio = getAudio(ctx.msg);
		if (!audio) {
			await ctx.reply('Please send a voice note or an OGG, MP3, M4A, WAV, FLAC, or WebM audio file.');
			return;
		}
		if ((audio.fileSize ?? 0) > MAX_BYTES || (audio.duration ?? 0) > MAX_DURATION) {
			await ctx.reply('Please send audio no larger than 20 MB and no longer than 10 minutes.');
			return;
		}
		if (!submit) {
			await ctx.reply('Transcription requires the Cloudflare Worker. Run npm run dev and connect a development webhook.');
			return;
		}
		const accepted = await submit({
			id: ctx.update.update_id, chatId: ctx.chat.id, messageId: ctx.msg.message_id,
			userId: ctx.from.id, fileId: audio.fileId, mimeType: audio.mimeType,
			...(audio.duration === undefined ? {} : { duration: audio.duration }),
		});
		if (accepted !== true) await ctx.reply(typeof accepted === 'string' ? accepted : 'Too many recordings or the bot is busy. Please wait a minute before sending another.');
	});

	return bot;
}
