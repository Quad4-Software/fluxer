// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	resolveStatusPageIncidentHistoryUrl,
	resolveStatusPageUrl,
} from '@app/features/app/utils/StatusPageUrlUtils';
import {describe, expect, test} from 'vitest';

const DEFAULT_HOSTED_URL = 'https://status.example.com';

describe('resolveStatusPageUrl', () => {
	test('returns configured URL when set', () => {
		expect(
			resolveStatusPageUrl({
				configuredUrl: ' https://ops.example.com ',
				selfHosted: true,
				defaultHostedStatusUrl: DEFAULT_HOSTED_URL,
			}),
		).toBe('https://ops.example.com');
	});

	test('returns null for self-hosted without configured URL', () => {
		expect(
			resolveStatusPageUrl({
				configuredUrl: null,
				selfHosted: true,
				defaultHostedStatusUrl: DEFAULT_HOSTED_URL,
			}),
		).toBeNull();
	});

	test('falls back to hosted default when not self-hosted', () => {
		expect(
			resolveStatusPageUrl({
				configuredUrl: '',
				selfHosted: false,
				defaultHostedStatusUrl: DEFAULT_HOSTED_URL,
			}),
		).toBe(DEFAULT_HOSTED_URL);
	});
});

describe('resolveStatusPageIncidentHistoryUrl', () => {
	test('returns configured history URL when set', () => {
		expect(
			resolveStatusPageIncidentHistoryUrl({
				configuredHistoryUrl: 'https://ops.example.com/history',
				statusPageUrl: 'https://ops.example.com',
			}),
		).toBe('https://ops.example.com/history');
	});

	test('derives history URL from status page URL', () => {
		expect(
			resolveStatusPageIncidentHistoryUrl({
				configuredHistoryUrl: null,
				statusPageUrl: 'https://ops.example.com/',
			}),
		).toBe('https://ops.example.com/history');
	});

	test('returns null when no status page URL is available', () => {
		expect(
			resolveStatusPageIncidentHistoryUrl({
				configuredHistoryUrl: null,
				statusPageUrl: null,
			}),
		).toBeNull();
	});
});
