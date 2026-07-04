// SPDX-License-Identifier: AGPL-3.0-or-later

interface NodemailerLikeError {
	message?: string;
	code?: string;
	command?: string;
	response?: string;
	responseCode?: number;
}

export function formatSmtpVerifyError(error: unknown): string {
	if (!(error instanceof Error)) {
		return String(error);
	}
	const smtpError = error as NodemailerLikeError;
	const parts: Array<string> = [];
	if (smtpError.code) {
		parts.push(smtpError.code);
	}
	const message = smtpError.message?.trim();
	if (message) {
		parts.push(message);
	}
	if (smtpError.response?.trim()) {
		parts.push(smtpError.response.trim());
	}
	if (smtpError.command?.trim()) {
		parts.push(`Command: ${smtpError.command.trim()}`);
	}
	if (smtpError.responseCode) {
		parts.push(`Response code: ${smtpError.responseCode}`);
	}
	if (parts.length > 0) {
		return parts.join(' — ');
	}
	return error.message || 'SMTP validation failed';
}
