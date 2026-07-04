// SPDX-License-Identifier: AGPL-3.0-or-later

import {applyServiceInstrumentation} from '@pkgs/initialization/src/CreateServiceInstrumentation';
import type {ResolvedSentryRuntimeConfig} from '@pkgs/initialization/src/SentryService';
import {Config} from '@app/Config';

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
