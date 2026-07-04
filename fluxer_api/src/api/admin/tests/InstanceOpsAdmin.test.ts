// SPDX-License-Identifier: AGPL-3.0-or-later

import {AdminACLs} from '@fluxer/constants/src/AdminACLs';
import type {
	InstanceHealthResponse,
	InstanceIntegrationTestResponse,
} from '@fluxer/schema/src/domains/admin/AdminSchemas';
import {afterEach, beforeEach, describe, expect, test} from 'vitest';
import {Config} from '../../Config';
import {createTestAccount, setUserACLs, type TestAccount} from '../../auth/tests/AuthTestUtils';
import {type ApiTestHarness, createApiTestHarness} from '../../test/ApiTestHarness';
import {HTTP_STATUS} from '../../test/TestConstants';
import {createBuilder, createBuilderWithoutAuth} from '../../test/TestRequestBuilder';

async function createAdmin(harness: ApiTestHarness): Promise<TestAccount> {
	const account = await createTestAccount(harness);
	return await setUserACLs(harness, account, [
		AdminACLs.AUTHENTICATE,
		AdminACLs.INSTANCE_CONFIG_VIEW,
		AdminACLs.INSTANCE_CONFIG_UPDATE,
	]);
}

describe('InstanceOpsAdminController', () => {
	let harness: ApiTestHarness;
	let previousSelfHosted: boolean;

	beforeEach(async () => {
		harness = await createApiTestHarness({search: 'enabled'});
		previousSelfHosted = Config.instance.selfHosted;
		Config.instance.selfHosted = true;
	});

	afterEach(async () => {
		Config.instance.selfHosted = previousSelfHosted;
		await harness?.shutdown();
	});

	test('instance health requires authentication', async () => {
		await createBuilderWithoutAuth(harness)
			.get('/admin/instance-health')
			.expect(HTTP_STATUS.UNAUTHORIZED)
			.execute();
	});

	test('instance health requires INSTANCE_CONFIG_VIEW', async () => {
		const admin = await createTestAccount(harness);
		await setUserACLs(harness, admin, [AdminACLs.AUTHENTICATE]);
		await createBuilder(harness, `${admin.token}`)
			.get('/admin/instance-health')
			.expect(HTTP_STATUS.FORBIDDEN)
			.execute();
	});

	test('instance health returns service statuses on self-hosted', async () => {
		const admin = await createAdmin(harness);
		const response = await createBuilder<InstanceHealthResponse>(harness, `${admin.token}`)
			.get('/admin/instance-health')
			.expect(HTTP_STATUS.OK)
			.execute();
		expect(response.checked_at.length).toBeGreaterThan(0);
		expect(response.services.length).toBeGreaterThan(0);
		expect(response.services.some((service) => service.name === 'api')).toBe(true);
		expect(response.active_jobs.queued).toBeGreaterThanOrEqual(0);
		expect(response.active_jobs.running).toBeGreaterThanOrEqual(0);
	});

	test('instance health is unavailable when not self-hosted', async () => {
		Config.instance.selfHosted = false;
		const admin = await createAdmin(harness);
		await createBuilder(harness, `${admin.token}`)
			.get('/admin/instance-health')
			.expect(HTTP_STATUS.NOT_FOUND)
			.execute();
	});

	test('s3 integration test uploads and deletes a probe object', async () => {
		const admin = await createAdmin(harness);
		const response = await createBuilder<InstanceIntegrationTestResponse>(harness, `${admin.token}`)
			.post('/admin/instance-config/integrations/s3/test')
			.body({})
			.expect(HTTP_STATUS.OK)
			.execute();
		expect(response.ok).toBe(true);
		expect(response.error).toBeNull();
	});

	test('livekit integration test reports disabled voice cleanly', async () => {
		const admin = await createAdmin(harness);
		const previousVoiceEnabled = Config.voice.enabled;
		Config.voice.enabled = false;
		try {
			const response = await createBuilder<InstanceIntegrationTestResponse>(harness, `${admin.token}`)
				.post('/admin/instance-config/integrations/livekit/test')
				.body({})
				.expect(HTTP_STATUS.OK)
				.execute();
			expect(response.ok).toBe(false);
			expect(response.error).toContain('not enabled');
		} finally {
			Config.voice.enabled = previousVoiceEnabled;
		}
	});
});
