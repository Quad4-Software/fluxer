// SPDX-License-Identifier: AGPL-3.0-or-later

import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import type {ApiTestHarness} from '../../test/ApiTestHarness';
import {HTTP_STATUS} from '../../test/TestConstants';
import {createBuilder, createBuilderWithoutAuth} from '../../test/TestRequestBuilder';
import {
	createAuthHarness,
	createTestAccount,
	disableSso,
	enableSso,
	setUserACLs,
	type TestAccount,
} from './AuthTestUtils';

interface ErrorResponse {
	code: string;
	message: string;
}

interface SsoCompleteResponse {
	token: string;
	user_id: string;
}

async function createSsoProvisionedAccount(harness: ApiTestHarness): Promise<TestAccount> {
	const startData = await createBuilderWithoutAuth<{state: string}>(harness).post('/auth/sso/start').body({}).execute();
	const email = `sso-security-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
	const completeData = await createBuilderWithoutAuth<SsoCompleteResponse>(harness)
		.post('/auth/sso/complete')
		.body({code: email, state: startData.state})
		.execute();
	return {email, password: '', userId: completeData.user_id, token: completeData.token};
}

describe('SSO managed account security', () => {
	let harness: ApiTestHarness;
	let admin: TestAccount;
	beforeAll(async () => {
		harness = await createAuthHarness();
	});
	beforeEach(async () => {
		await harness.reset();
		admin = await createTestAccount(harness);
		admin = await setUserACLs(harness, admin, ['admin:authenticate', 'instance:config:update', 'instance:config:view']);
	});
	afterAll(async () => {
		await harness?.shutdown();
	});
	describe('sudo mode with no password and no MFA', () => {
		afterEach(async () => {
			await disableSso(harness, admin.token);
		});
		it('lets a passwordless SSO user complete a sudo-gated action without password or MFA', async () => {
			await enableSso(harness, admin.token);
			const ssoAccount = await createSsoProvisionedAccount(harness);
			await createBuilder(harness, ssoAccount.token)
				.delete('/users/@me/authorized-ips')
				.body({})
				.expect(HTTP_STATUS.NO_CONTENT)
				.execute();
		});
	});
	describe('actions reserved for the identity provider when SSO is enforced', () => {
		beforeEach(async () => {
			await enableSso(harness, admin.token);
		});
		afterEach(async () => {
			await disableSso(harness, admin.token);
		});
		it('blocks starting an email change', async () => {
			const ssoAccount = await createSsoProvisionedAccount(harness);
			const {json: errResp} = await createBuilder<ErrorResponse>(harness, ssoAccount.token)
				.post('/users/@me/email-change/start')
				.body({})
				.expect(HTTP_STATUS.FORBIDDEN)
				.executeWithResponse();
			expect(errResp.code).toBe('SSO_MANAGED_ACCOUNT_ACTION_FORBIDDEN');
		});
		it('blocks setting a password', async () => {
			const ssoAccount = await createSsoProvisionedAccount(harness);
			const {json: errResp} = await createBuilder<ErrorResponse>(harness, ssoAccount.token)
				.patch('/users/@me')
				.body({new_password: 'SomeNewPassword123!'})
				.expect(HTTP_STATUS.FORBIDDEN)
				.executeWithResponse();
			expect(errResp.code).toBe('SSO_MANAGED_ACCOUNT_ACTION_FORBIDDEN');
		});
		it('blocks enabling TOTP MFA', async () => {
			const ssoAccount = await createSsoProvisionedAccount(harness);
			const {json: errResp} = await createBuilder<ErrorResponse>(harness, ssoAccount.token)
				.post('/users/@me/mfa/totp/enable')
				.body({secret: 'AAAAAAAAAAAAAAAA', code: '123456'})
				.expect(HTTP_STATUS.FORBIDDEN)
				.executeWithResponse();
			expect(errResp.code).toBe('SSO_MANAGED_ACCOUNT_ACTION_FORBIDDEN');
		});
		it('blocks registering a WebAuthn credential', async () => {
			const ssoAccount = await createSsoProvisionedAccount(harness);
			const {json: errResp} = await createBuilder<ErrorResponse>(harness, ssoAccount.token)
				.post('/users/@me/mfa/webauthn/credentials/registration-options')
				.body({})
				.expect(HTTP_STATUS.FORBIDDEN)
				.executeWithResponse();
			expect(errResp.code).toBe('SSO_MANAGED_ACCOUNT_ACTION_FORBIDDEN');
		});
	});
	describe('SSO enabled but not enforced', () => {
		beforeEach(async () => {
			await enableSso(harness, admin.token, {enforced: false});
		});
		afterEach(async () => {
			await disableSso(harness, admin.token);
		});
		it('still allows a passwordless SSO user to manage their own credentials', async () => {
			const ssoAccount = await createSsoProvisionedAccount(harness);
			await createBuilder(harness, ssoAccount.token)
				.post('/users/@me/email-change/start')
				.body({})
				.expect(HTTP_STATUS.OK)
				.execute();
		});
	});
});
