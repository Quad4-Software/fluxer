// SPDX-License-Identifier: AGPL-3.0-or-later

import {afterEach, beforeEach, describe, test} from 'vitest';
import {getConfig} from '../../Config';
import {type ApiTestHarness, createApiTestHarness} from '../../test/ApiTestHarness';
import {HTTP_STATUS} from '../../test/TestConstants';
import {createBuilderWithoutAuth} from '../../test/TestRequestBuilder';

describe('Internal RPC security', () => {
	let harness: ApiTestHarness;

	beforeEach(async () => {
		harness = await createApiTestHarness();
	});

	afterEach(async () => {
		await harness.shutdown();
	});

	test('rejects unauthenticated internal rpc requests', async () => {
		await createBuilderWithoutAuth(harness)
			.post('/internal/rpc')
			.body({type: 'geoip_lookup', ip: '8.8.8.8'})
			.expect(HTTP_STATUS.UNAUTHORIZED)
			.execute();
	});

	test('rejects internal rpc requests with invalid auth token', async () => {
		await createBuilderWithoutAuth(harness)
			.header('x-fluxer-rpc-auth', 'invalid-token')
			.post('/internal/rpc')
			.body({type: 'geoip_lookup', ip: '8.8.8.8'})
			.expect(HTTP_STATUS.UNAUTHORIZED)
			.execute();
	});

	test('accepts internal rpc requests with configured gateway token', async () => {
		const token = getConfig().internal.gatewayRpcAuthToken;
		await createBuilderWithoutAuth(harness)
			.header('x-fluxer-rpc-auth', token)
			.post('/internal/rpc')
			.body({type: 'geoip_lookup', ip: '8.8.8.8'})
			.expect(HTTP_STATUS.OK)
			.execute();
	});
});
