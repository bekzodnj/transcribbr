import { GrammyError } from 'grammy';

// Never log raw error objects/stacks: HTTP clients can attach token-bearing URLs.
export function safeError(error: unknown, secrets: string[]) {
	let message = error instanceof Error ? error.message : 'Unknown non-Error failure';
	for (const secret of secrets.filter(Boolean)) message = message.split(secret).join('[REDACTED]');
	message = message
		.replace(/https?:\/\/[^\s"'<>]+/gi, '[URL REDACTED]')
		.replace(/\b\d+:[A-Za-z0-9_-]+/g, '[TOKEN REDACTED]')
		.replace(/[A-Za-z0-9+/=_-]{80,}/g, '[PAYLOAD REDACTED]')
		.slice(0, 600);
	return {
		errorType: error instanceof Error ? error.name : 'Unknown',
		errorMessage: message,
		...(error instanceof GrammyError ? { telegramCode: error.error_code, telegramMethod: error.method } : {}),
	};
}
