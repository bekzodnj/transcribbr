import type { Job } from './types';

function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object';
}

// Isolated PoC adapter: no SDK, uploaded files, or Telegram token-bearing URLs.
export async function transcribeWithGemini(apiKey: string, audio: string, job: Job): Promise<string> {
	const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
		method: 'POST',
		headers: {
			'x-goog-api-key': apiKey,
			'Content-Type': 'application/json',
			'Api-Revision': '2026-05-20',
		},
		body: JSON.stringify({
			model: 'models/gemini-3.5-transcribe',
			// Telegram labels M4A/MP4 audio as audio/mp4; Google documents audio/m4a.
			input: [{ type: 'audio', data: audio, mime_type: job.mimeType === 'audio/mp4' ? 'audio/m4a' : job.mimeType }],
			store: false,
			generation_config: {
				transcription_config: {
					mode: { type: 'verbatim' },
					language_codes: job.audioLanguage && job.audioLanguage !== 'auto'
						? [{ en: 'en-US', uz: 'uz-UZ', ru: 'ru-RU' }[job.audioLanguage]] : [],
				},
			},
		}),
		signal: AbortSignal.timeout(120_000),
		// Workers supports only follow/manual. Reject 3xx via response.ok below
		// rather than forwarding the API key and audio to a redirect destination.
		redirect: 'manual',
	});
	if (!response.ok) {
		await response.body?.cancel();
		// Do not propagate provider bodies: they can echo audio, transcripts or credentials.
		throw new Error(`Gemini transcription failed (HTTP ${response.status})`);
	}
	let result: unknown;
	try {
		result = await response.json();
	} catch {
		throw new Error('Gemini response was not valid JSON');
	}
	if (!isObject(result) || result.status !== 'completed') throw new Error('Gemini transcription did not complete');
	// A live silent-audio test returned a completed interaction with zero output
	// tokens and no steps. Treat only that explicit case as no speech.
	if (isObject(result.usage) && result.usage.total_output_tokens === 0
		&& (result.steps === undefined || (Array.isArray(result.steps) && !result.steps.length))) return '';
	// output_text is an SDK convenience; REST returns model-output steps.
	if (!Array.isArray(result.steps)) throw new Error('Gemini response did not contain transcription steps');
	const texts: string[] = [];
	for (const step of result.steps) {
		if (!isObject(step) || step.type !== 'model_output' || !Array.isArray(step.content)) continue;
		for (const content of step.content) {
			if (isObject(content) && content.type === 'text' && typeof content.text === 'string') texts.push(content.text);
		}
	}
	if (!texts.length) throw new Error('Gemini response did not contain a text field');
	return texts.join('\n').trim();
}
