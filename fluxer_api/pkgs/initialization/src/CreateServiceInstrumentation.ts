// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	configureSentryMonitoring,
	type ResolvedSentryRuntimeConfig,
	shutdownSentryMonitoring,
} from '@pkgs/initialization/src/SentryService';

interface CreateServiceInstrumentationOptions {
	serviceName: string;
	config: {
		nodeEnv: string;
		sentry: {
			enabled: boolean;
			clientEnabled: boolean;
			dsn: string;
			environment: string;
		};
	};
}

export async function applyServiceInstrumentation(
	options: CreateServiceInstrumentationOptions,
	runtimeConfig?: ResolvedSentryRuntimeConfig,
): Promise<void> {
	const {serviceName, config} = options;
	const resolved =
		runtimeConfig ??
		({
			enabled: config.sentry.enabled && config.sentry.dsn.trim().length > 0,
			clientEnabled: config.sentry.clientEnabled && config.sentry.dsn.trim().length > 0,
			dsn: config.sentry.dsn.trim() || null,
			environment: config.sentry.environment.trim() || config.nodeEnv,
		} satisfies ResolvedSentryRuntimeConfig);
	await configureSentryMonitoring(resolved, serviceName);
}

export function createServiceInstrumentation(options: CreateServiceInstrumentationOptions): () => Promise<void> {
	void applyServiceInstrumentation(options).catch((error: unknown) => {
		process.stderr.write(
			`[instrument] Failed to initialize monitoring: ${error instanceof Error ? error.message : String(error)}\n`,
		);
	});
	return shutdownSentryMonitoring;
}
