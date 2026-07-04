// SPDX-License-Identifier: AGPL-3.0-or-later

import {AltchaProvider} from '@pkgs/captcha/src/providers/AltchaProvider';
import {describe, expect, it} from 'vitest';

describe('AltchaProvider', () => {
	it('rejects empty tokens', async () => {
		const provider = new AltchaProvider({hmacSecret: 'test-secret'});
		await expect(provider.verify({token: ''})).resolves.toBe(false);
		await expect(provider.verify({token: '   '})).resolves.toBe(false);
	});

	it('rejects invalid payloads', async () => {
		const provider = new AltchaProvider({hmacSecret: 'test-secret'});
		await expect(provider.verify({token: 'not-json'})).resolves.toBe(false);
		await expect(provider.verify({token: '{"algorithm":"SHA-256"}'})).resolves.toBe(false);
	});
});
