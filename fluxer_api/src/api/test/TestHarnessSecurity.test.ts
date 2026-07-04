// SPDX-License-Identifier: AGPL-3.0-or-later

import {afterEach, beforeEach, describe, expect, test} from 'vitest';
import {createTestAccount} from '../auth/tests/AuthTestUtils';
import {createUserID} from '../BrandedTypes';
import {getConfig} from '../Config';
import {getUserRepository} from '../middleware/ServiceSingletons';
import {type ApiTestHarness, createApiTestHarness} from './ApiTestHarness';
import {HTTP_STATUS, TEST_IDS} from './TestConstants';
import {createBuilder, createBuilderWithoutAuth} from './TestRequestBuilder';

interface HarnessConfigSnapshot {
	nodeEnv: string;
	testModeEnabled: boolean;
	testHarnessToken: string | undefined;
	selfHosted: boolean;
}

function snapshotHarnessConfig(): HarnessConfigSnapshot {
	const config = getConfig();
	return {
		nodeEnv: config.nodeEnv,
		testModeEnabled: config.dev.testModeEnabled,
		testHarnessToken: config.dev.testHarnessToken,
		selfHosted: config.instance.selfHosted,
	};
}

function restoreHarnessConfig(snapshot: HarnessConfigSnapshot): void {
	const config = getConfig();
	config.nodeEnv = snapshot.nodeEnv;
	config.dev.testModeEnabled = snapshot.testModeEnabled;
	config.dev.testHarnessToken = snapshot.testHarnessToken;
	config.instance.selfHosted = snapshot.selfHosted;
}

async function expectUserACLs(userId: string, expectedACLs: Array<string>): Promise<void> {
	const user = await getUserRepository().findUniqueAssert(createUserID(BigInt(userId)));
	expect([...user.acls].sort()).toEqual([...expectedACLs].sort());
}

describe('Test harness security', () => {
	let harness: ApiTestHarness;
	let harnessConfig: HarnessConfigSnapshot;

	beforeEach(async () => {
		harnessConfig = snapshotHarnessConfig();
		harness = await createApiTestHarness();
	});

	afterEach(async () => {
		restoreHarnessConfig(harnessConfig);
		await harness.shutdown();
	});

	test('rejects harness routes when test mode is off and node env is production', async () => {
		const config = getConfig();
		config.nodeEnv = 'production';
		config.dev.testModeEnabled = false;
		config.dev.testHarnessToken = undefined;

		await createBuilderWithoutAuth(harness)
			.post('/test/users/1/acls')
			.body({acls: ['admin:authenticate']})
			.expect(HTTP_STATUS.NOT_FOUND, 'TEST_HARNESS_DISABLED')
			.execute();
	});

	test('requires harness token when configured', async () => {
		const config = getConfig();
		config.nodeEnv = 'development';
		config.dev.testModeEnabled = false;
		config.dev.testHarnessToken = 'harness-secret-token';

		await createBuilderWithoutAuth(harness)
			.post(`/test/users/${TEST_IDS.NONEXISTENT_USER}/acls`)
			.body({acls: ['admin:authenticate']})
			.expect(HTTP_STATUS.FORBIDDEN, 'TEST_HARNESS_FORBIDDEN')
			.execute();

		await createBuilderWithoutAuth(harness)
			.header('x-test-token', 'harness-secret-token')
			.post(`/test/users/${TEST_IDS.NONEXISTENT_USER}/acls`)
			.body({acls: ['admin:authenticate']})
			.expect(HTTP_STATUS.NOT_FOUND, 'UNKNOWN_USER')
			.execute();
	});

	test('development mode without harness token allows unauthenticated privilege escalation', async () => {
		const config = getConfig();
		config.nodeEnv = 'development';
		config.dev.testModeEnabled = false;
		config.dev.testHarnessToken = undefined;
		config.instance.selfHosted = true;

		await createTestAccount(harness);
		const account = await createTestAccount(harness);
		await expectUserACLs(account.userId, []);

		await createBuilderWithoutAuth(harness)
			.post(`/test/users/${account.userId}/acls`)
			.body({acls: ['admin:authenticate', 'user:lookup']})
			.expect(HTTP_STATUS.OK)
			.execute();

		await expectUserACLs(account.userId, ['admin:authenticate', 'user:lookup']);

		await createBuilder(harness, account.token)
			.post('/admin/users/lookup')
			.body({user_ids: [account.userId]})
			.expect(HTTP_STATUS.OK)
			.execute();
	});
});
