// Run with BOT_TOKEN, WEBHOOK_SECRET, and WEBHOOK_URL in .env.
class ConfigurationError extends Error {}

async function registerWebhook() {
	const { BOT_TOKEN, WEBHOOK_SECRET, WEBHOOK_URL } = process.env;
	if (!BOT_TOKEN || !WEBHOOK_SECRET || !WEBHOOK_URL) {
		const missing = ['BOT_TOKEN', 'WEBHOOK_SECRET', 'WEBHOOK_URL'].filter((key) => !process.env[key]);
		throw new ConfigurationError(`Missing from .env: ${missing.join(', ')}.`);
	}
	let url: URL;
	try {
		url = new URL(WEBHOOK_URL);
	} catch {
		throw new ConfigurationError('WEBHOOK_URL is not a valid URL.');
	}
	if (url.protocol !== 'https:' || url.pathname !== '/webhook') {
		throw new ConfigurationError('WEBHOOK_URL must be an HTTPS URL ending in /webhook.');
	}
	if (/[^A-Za-z0-9_-]/.test(WEBHOOK_SECRET)) {
		throw new ConfigurationError('WEBHOOK_SECRET contains invalid characters. Use only letters, numbers, underscores, or hyphens (not standard Base64 punctuation such as +, /, or =).');
	}
	if (WEBHOOK_SECRET.length < 32 || WEBHOOK_SECRET.length > 256) {
		throw new ConfigurationError('WEBHOOK_SECRET must be 32–256 characters long.');
	}
	try {
		const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
			method: 'POST', headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ url: url.href, secret_token: WEBHOOK_SECRET, allowed_updates: ['message', 'callback_query'] }),
			signal: AbortSignal.timeout(30_000),
		});
		const result = await response.json() as { ok?: boolean };
		if (!response.ok || !result.ok) throw new Error('Telegram rejected webhook registration.');
		console.log('Webhook registered successfully. Pending updates were preserved.');
	} catch {
		// Never print errors that could contain a token-bearing request URL.
		console.error('Webhook registration failed. Check the token, HTTPS endpoint, and connectivity.');
		process.exitCode = 1;
	}
}

registerWebhook().catch((error: unknown) => {
	console.error(error instanceof ConfigurationError ? error.message : 'Webhook setup failed unexpectedly.');
	process.exitCode = 1;
});
