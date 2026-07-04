// SPDX-License-Identifier: AGPL-3.0-or-later

import * as Sentry from '@sentry/react';

export interface ClientSentryConfig {
	enabled: boolean;
	dsn: string | null;
	environment: string | null;
}

let activeDsn: string | null = null;

export function configureClientSentry(config: ClientSentryConfig): void {
	const nextDsn = config.enabled && config.dsn ? config.dsn : null;
	if (activeDsn === nextDsn) {
		return;
	}
	if (activeDsn) {
		void Sentry.close();
		activeDsn = null;
	}
	if (!nextDsn) {
		return;
	}
	Sentry.init({
		dsn: nextDsn,
		environment: config.environment ?? 'production',
		tracesSampleRate: 0,
	});
	activeDsn = nextDsn;
}

export function captureClientException(error: unknown): void {
	if (!activeDsn) {
		return;
	}
	Sentry.captureException(error);
}
