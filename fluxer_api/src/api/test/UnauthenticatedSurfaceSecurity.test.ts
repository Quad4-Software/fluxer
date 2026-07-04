// SPDX-License-Identifier: AGPL-3.0-or-later

import {afterEach, beforeEach, describe, expect, test} from 'vitest';
import {type ApiTestHarness, createApiTestHarness} from './ApiTestHarness';
import {createBuilderWithoutAuth} from './TestRequestBuilder';

describe('Unauthenticated observability endpoints', () => {
	let harness: ApiTestHarness;

	beforeEach(async () => {
		harness = await createApiTestHarness();
	});

	afterEach(async () => {
		await harness.shutdown();
	});

	test('prometheus metrics are exposed without authentication', async () => {
		const response = await harness.requestJson({
			path: '/_metrics',
			method: 'GET',
		});
		expect(response.status).toBe(200);
		const body = await response.text();
		expect(body).toContain('fluxer_api_http_requests_total');
	});

	test('health endpoint is exposed without authentication', async () => {
		const response = await harness.requestJson({
			path: '/_health',
			method: 'GET',
		});
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('OK');
	});
});

describe('Protected user endpoints', () => {
	let harness: ApiTestHarness;

	beforeEach(async () => {
		harness = await createApiTestHarness();
	});

	afterEach(async () => {
		await harness.shutdown();
	});

	test('users @me rejects unauthenticated access', async () => {
		await createBuilderWithoutAuth(harness).get('/users/@me').expect(401).execute();
	});
});
