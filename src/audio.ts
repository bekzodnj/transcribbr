import type { Message } from 'grammy/types';

export const MAX_BYTES = 20_000_000;
export const MAX_DURATION = 600;
const formats: Record<string, string> = {
	ogg: 'audio/ogg', opus: 'audio/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4',
	mp4: 'audio/mp4', wav: 'audio/wav', flac: 'audio/flac', webm: 'audio/webm',
};

export function getAudio(message: Message) {
	const file = message.voice ?? message.audio ?? message.document;
	if (!file) return;
	const extension = 'file_name' in file ? file.file_name?.split('.').pop()?.toLowerCase() : undefined;
	const mimeType = file.mime_type?.split(';')[0].toLowerCase();
	if (!message.voice && !Object.values(formats).includes(mimeType ?? '') && !formats[extension ?? '']) return;
	return {
		fileId: file.file_id,
		mimeType: mimeType && Object.values(formats).includes(mimeType) ? mimeType : formats[extension ?? ''] ?? 'audio/ogg',
		fileSize: file.file_size,
		duration: 'duration' in file ? file.duration : undefined,
	};
}

export function splitTranscript(text: string, size = 4000): string[] {
	// Iterate code points so a split cannot break a surrogate pair.
	const chunks: string[] = [];
	let chunk = '';
	for (const character of text) {
		if (chunk.length + character.length > size) {
			chunks.push(chunk);
			chunk = '';
		}
		chunk += character;
	}
	if (chunk) chunks.push(chunk);
	return chunks;
}
