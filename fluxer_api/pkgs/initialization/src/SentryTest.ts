// SPDX-License-Identifier: AGPL-3.0-or-later

import crypto from 'node:crypto';
import {parseSentryDsn, validateSentryDsn} from '@pkgs/initialization/src/SentryDsn';

export interface SentryTestResult {
	eventId: string;
}

export async function sendSentryTestEvent(params: {
	dsn: string;
	environment: string;
	serviceName: string;
}): Promise<SentryTestResult> {
	const validation = validateSentryDsn(params.dsn);
	if (!validation.ok) {
		throw new Error(validation.error);
	}
	const parsed = validation.parsed;
	const eventId = crypto.randomUUID().replace(/-/gu, '');
	const timestamp = Date.now() / 1000;
	const event = {
		event_id: eventId,
		timestamp,
		platform: 'node',
		level: 'info',
		logger: 'fluxer.monitoring.test',
		message: 'Fluxer monitoring connection test',
		environment: params.environment,
		tags: {
			source: 'fluxer_admin_test',
			service: params.serviceName,
		},
	};
	const envelopeHeader = JSON.stringify({event_id: eventId, sent_at: new Date().toISOString()});
	const itemHeader = JSON.stringify({type: 'event', length: Buffer.byteLength(JSON.stringify(event), 'utf8')});
	const body = `${envelopeHeader}\n${itemHeader}\n${JSON.stringify(event)}`;
	const ingestUrl = `${parsed.protocol}://${parsed.host}/api/${parsed.projectId}/envelope/`;
	const response = await fetch(ingestUrl, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-sentry-envelope',
			'X-Sentry-Auth': `Sentry sentry_version=7, sentry_client=fluxer-monitoring-test/1.0, sentry_key=${parsed.publicKey}`,
		},
		body,
		signal: AbortSignal.timeout(10_000),
	});
	if (!response.ok) {
		const responseText = await response.text().catch(() => '');
		const suffix = responseText.trim() ? `: ${responseText.trim()}` : '';
		throw new Error(`Sentry or GlitchTip rejected the test event (${response.status})${suffix}`);
	}
	return {eventId};
}

export function buildSentryIngestUrl(dsn: string): string | null {
	const parsed = parseSentryDsn(dsn);
	if (!parsed) {
		return null;
	}
	return `${parsed.protocol}://${parsed.host}/api/${parsed.projectId}/envelope/`;
}
