// SPDX-License-Identifier: AGPL-3.0-or-later

import {parseSentryDsn, validateSentryDsn} from '@pkgs/initialization/src/SentryDsn';
import {describe, expect, it} from 'vitest';

describe('parseSentryDsn', () => {
	it('parses a standard Sentry DSN', () => {
		const parsed = parseSentryDsn('https://0123456789abcdef0123456789abcdef@o123.ingest.sentry.io/42');
		expect(parsed).toEqual({
			protocol: 'https',
			publicKey: '0123456789abcdef0123456789abcdef',
			host: 'o123.ingest.sentry.io',
			projectId: '42',
		});
	});

	it('parses a GlitchTip-style DSN with a custom host', () => {
		const parsed = parseSentryDsn('https://0123456789abcdef0123456789abcdef@glitchtip.example.com/1');
		expect(parsed).toEqual({
			protocol: 'https',
			publicKey: '0123456789abcdef0123456789abcdef',
			host: 'glitchtip.example.com',
			projectId: '1',
		});
	});

	it('rejects malformed DSN values', () => {
		expect(parseSentryDsn('not-a-dsn')).toBeNull();
		expect(validateSentryDsn('not-a-dsn').ok).toBe(false);
	});
});
