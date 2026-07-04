// SPDX-License-Identifier: AGPL-3.0-or-later

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as AuthPassword from '../AuthPassword';
import {getConfig} from '../../Config';
import {createEasypwnedCheckHandler} from '../../test/msw/handlers/EasypwnedHandlers';
import {createPwnedPasswordsRangeHandler} from '../../test/msw/handlers/PwnedPasswordsHandlers';
import {server} from '../../test/msw/server';

describe('isPasswordPwned', () => {
	const originalEasypwned = getConfig().easypwned;

	beforeEach(() => {
		getConfig().easypwned = {
			enabled: false,
			url: 'http://easypwned.test',
			failOpen: true,
		};
	});

	afterEach(() => {
		getConfig().easypwned = originalEasypwned;
	});

	it('uses the HIBP range API when easypwned is disabled', async () => {
		server.use(
			createPwnedPasswordsRangeHandler({
				suffixes: [{suffix: '1E4C9B93F3F0682250B6CF8331B7EE68FD8', count: 3}],
			}),
		);
		await expect(AuthPassword.isPasswordPwned({} as never, 'password')).resolves.toBe(true);
	});

	it('uses easypwned when enabled and rejects breached passwords', async () => {
		getConfig().easypwned.enabled = true;
		server.use(createEasypwnedCheckHandler({secure: false}));
		await expect(AuthPassword.isPasswordPwned({} as never, 'password')).resolves.toBe(true);
	});

	it('uses easypwned when enabled and accepts secure passwords', async () => {
		getConfig().easypwned.enabled = true;
		server.use(createEasypwnedCheckHandler({secure: true}));
		await expect(AuthPassword.isPasswordPwned({} as never, 'unique-password-12345')).resolves.toBe(false);
	});

	it('fails open through easypwned when configured and the service errors', async () => {
		getConfig().easypwned.enabled = true;
		getConfig().easypwned.failOpen = true;
		server.use(createEasypwnedCheckHandler({status: 503}));
		await expect(AuthPassword.isPasswordPwned({} as never, 'another-unique-password')).resolves.toBe(false);
	});

	it('fails closed through easypwned when configured and the service errors', async () => {
		getConfig().easypwned.enabled = true;
		getConfig().easypwned.failOpen = false;
		server.use(createEasypwnedCheckHandler({status: 503}));
		await expect(AuthPassword.isPasswordPwned({} as never, 'strict-mode-password')).resolves.toBe(true);
	});
});
