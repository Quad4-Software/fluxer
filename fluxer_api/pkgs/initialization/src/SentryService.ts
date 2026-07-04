// SPDX-License-Identifier: AGPL-3.0-or-later

import {validateSentryDsn} from '@pkgs/initialization/src/SentryDsn';
import * as Sentry from '@sentry/node';

export interface ResolvedSentryRuntimeConfig {
	enabled: boolean;
	clientEnabled: boolean;
	dsn: string | null;
	environment: string;
}

let activeConfig: ResolvedSentryRuntimeConfig | null = null;

export function getActiveSentryConfig(): ResolvedSentryRuntimeConfig | null {
	return activeConfig;
}

export async function configureSentryMonitoring(
	config: ResolvedSentryRuntimeConfig,
	serviceName: string,
): Promise<void> {
	if (activeConfig?.enabled) {
		await Sentry.close(2_000);
	}
	activeConfig = config;
	if (!config.enabled || !config.dsn) {
		return;
	}
	const validation = validateSentryDsn(config.dsn);
	if (!validation.ok) {
		throw new Error(validation.error);
	}
	Sentry.init({
		dsn: config.dsn,
		environment: config.environment,
		release: undefined,
		tracesSampleRate: 0,
		initialScope: {
			tags: {
				service: serviceName,
			},
		},
		beforeSend(event) {
			event.tags = {
				...event.tags,
				service: serviceName,
			};
			return event;
		},
	});
}

export async function shutdownSentryMonitoring(): Promise<void> {
	if (!activeConfig?.enabled) {
		activeConfig = null;
		return;
	}
	await Sentry.close(2_000);
	activeConfig = null;
}

export function captureSentryException(error: unknown): void {
	if (!activeConfig?.enabled) {
		return;
	}
	Sentry.captureException(error);
}
