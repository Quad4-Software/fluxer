// SPDX-License-Identifier: AGPL-3.0-or-later

export interface ParsedSentryDsn {
	protocol: string;
	publicKey: string;
	host: string;
	projectId: string;
}

const SENTRY_DSN_PATTERN =
	/^(?<protocol>https?):\/\/(?<publicKey>[a-f0-9]{32})(?::(?<secretKey>[a-f0-9]{32}))?@(?<host>[^/]+)\/(?<projectId>\d+)\/?$/iu;

export function parseSentryDsn(dsn: string): ParsedSentryDsn | null {
	const trimmed = dsn.trim();
	if (!trimmed) {
		return null;
	}
	const match = SENTRY_DSN_PATTERN.exec(trimmed);
	if (!match?.groups) {
		return null;
	}
	const protocol = match.groups.protocol;
	const publicKey = match.groups.publicKey;
	const host = match.groups.host;
	const projectId = match.groups.projectId;
	if (!protocol || !publicKey || !host || !projectId) {
		return null;
	}
	return {
		protocol,
		publicKey,
		host,
		projectId,
	};
}

export function validateSentryDsn(dsn: string): {ok: true; parsed: ParsedSentryDsn} | {ok: false; error: string} {
	const parsed = parseSentryDsn(dsn);
	if (!parsed) {
		return {
			ok: false,
			error: 'Invalid Sentry or GlitchTip DSN. Expected format: https://<public_key>@<host>/<project_id>',
		};
	}
	return {ok: true, parsed};
}
