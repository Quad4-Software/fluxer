// SPDX-License-Identifier: AGPL-3.0-or-later

import {Config} from '@app/Config';
import {applyServiceInstrumentation} from '@pkgs/initialization/src/CreateServiceInstrumentation';
import type {ResolvedSentryRuntimeConfig} from '@pkgs/initialization/src/SentryService';

const SERVICE_NAME = 'fluxer-api';

export async function applyInstanceSentryMonitoring(config: ResolvedSentryRuntimeConfig): Promise<void> {
	await applyServiceInstrumentation(
		{
			serviceName: SERVICE_NAME,
			config: Config,
		},
		config,
	);
}
