import { afterEach, describe, expect, it, vi } from 'vitest';
import { transcribeWithGemini } from '../src/gemini';
import type { Job } from '../src/types';

const job: Job = { id: 1, userId: 2, chatId: 2, messageId: 3, fileId: 'voice-file', mimeType: 'audio/ogg' };
const completed = (text: string) => ({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text }] }] });
afterEach(() => vi.unstubAllGlobals());

describe('Gemini PoC adapter', () => {
	it.each([
		['uz', ['uz-UZ']], ['en', ['en-US']], ['auto', []], [undefined, []],
	] as const)('sends inline audio in verbatim mode with language %s', async (audioLanguage, codes) => {
		const fetcher = vi.fn().mockImplementation(async (url, options) => {
			// Validate options with the actual Workers Request implementation, not
			// just a fetch mock: unsupported redirect modes throw here.
			const request = new Request(url, options);
			expect(request.redirect).toBe('manual');
			return Response.json(completed(' Salom! '));
		});
		vi.stubGlobal('fetch', fetcher);
		expect(await transcribeWithGemini('test-key', 'T2dnUw==', { ...job, audioLanguage })).toBe('Salom!');
		const [url, options] = fetcher.mock.calls[0];
		expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/interactions');
		expect(url).not.toContain('test-key');
		expect(options).toMatchObject({ method: 'POST', redirect: 'manual', headers: {
			'x-goog-api-key': 'test-key', 'Content-Type': 'application/json', 'Api-Revision': '2026-05-20',
		} });
		expect(JSON.parse(options.body)).toEqual({
			model: 'models/gemini-3.5-transcribe', store: false,
			input: [{ type: 'audio', data: 'T2dnUw==', mime_type: 'audio/ogg' }],
			generation_config: { transcription_config: { mode: { type: 'verbatim' }, language_codes: codes } },
		});
	});
	it('joins only model-output text, not input echoes or other steps', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ status: 'completed', steps: [
			{ type: 'user_input', content: [{ type: 'text', text: 'Do not echo this' }] },
			{ type: 'model_output', content: [{ type: 'text', text: 'First' }, { type: 'text', text: 'Second' }] },
		] })));
		expect(await transcribeWithGemini('test-key', 'audio', job)).toBe('First\nSecond');
	});
	it('returns empty speech as an empty string', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(completed(' '))));
		expect(await transcribeWithGemini('test-key', 'audio', job)).toBe('');
	});
	it('normalizes Telegram MP4 audio to the documented M4A MIME type', async () => {
		const fetcher = vi.fn().mockResolvedValue(Response.json(completed('Hello')));
		vi.stubGlobal('fetch', fetcher);
		await transcribeWithGemini('test-key', 'audio', { ...job, mimeType: 'audio/mp4' });
		expect(JSON.parse(fetcher.mock.calls[0][1].body).input[0].mime_type).toBe('audio/m4a');
	});
	it('accepts the observed silent-audio response with no steps and zero output tokens', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ status: 'completed', usage: { total_output_tokens: 0 } })));
		expect(await transcribeWithGemini('test-key', 'audio', job)).toBe('');
	});
	it.each([400, 401, 429, 500])('reports HTTP %s without exposing the provider body', async (status) => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('test-key private transcript', { status })));
		await expect(transcribeWithGemini('test-key', 'audio', job)).rejects.toThrow(`Gemini transcription failed (HTTP ${status})`);
	});
	it.each([301, 302, 303, 307, 308])('rejects HTTP %s without following the redirect', async (status) => {
		const response = new Response('private provider content', { status, headers: { Location: 'https://other.example/transcribe' } });
		const fetcher = vi.fn().mockResolvedValue(response);
		vi.stubGlobal('fetch', fetcher);
		await expect(transcribeWithGemini('test-key', 'audio', job)).rejects.toThrow(`Gemini transcription failed (HTTP ${status})`);
		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(fetcher.mock.calls[0][1].redirect).toBe('manual');
		expect(response.bodyUsed).toBe(true);
	});
	it.each([
		{ status: 'failed', steps: completed('partial').steps },
		{ status: 'in_progress', steps: completed('partial').steps },
		{ status: 'completed' },
		{ status: 'completed', steps: [] },
		null,
	])('rejects incomplete or malformed responses', async (body) => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));
		await expect(transcribeWithGemini('test-key', 'audio', job)).rejects.toThrow('Gemini');
	});
	it('does not expose malformed JSON in diagnostics', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private transcript, not JSON')));
		await expect(transcribeWithGemini('test-key', 'audio', job)).rejects.toThrow('Gemini response was not valid JSON');
	});
});
