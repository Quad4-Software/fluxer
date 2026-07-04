// SPDX-License-Identifier: AGPL-3.0-or-later

import {afterEach, describe, expect, it, vi} from 'vitest';
import {getConfig} from '../Config';
import {setCassandraQueryExecutorForTesting} from '../database/CassandraQueryExecution';
import type {PreparedQuery} from '../database/CassandraTypes';
import {InMemoryCassandraQueryExecutor} from '../test/InMemoryCassandraQueryExecutor';
import {MockKVProvider} from '../test/mocks/MockKVProvider';
import {
	INSTANCE_CONFIG_REFRESH_CHANNEL,
	InstanceConfigRepository,
	type InstanceRegistrationConfig,
} from './InstanceConfigRepository';

class CountingInMemoryCassandraQueryExecutor extends InMemoryCassandraQueryExecutor {
	instanceConfigSelects = 0;

	override async executeQuery<T = Record<string, unknown>>(query: PreparedQuery): Promise<Array<T>> {
		if (query.kvMeta?.action === 'select' && query.kvMeta.table.name === 'instance_configuration') {
			this.instanceConfigSelects++;
		}
		return super.executeQuery<T>(query);
	}
}

describe('InstanceConfigRepository', () => {
	const repositories: Array<InstanceConfigRepository> = [];

	afterEach(() => {
		for (const repository of repositories) {
			repository.shutdown();
		}
		repositories.length = 0;
	});

	function createRepository(kvProvider: MockKVProvider): InstanceConfigRepository {
		const repository = new InstanceConfigRepository(kvProvider);
		repositories.push(repository);
		return repository;
	}

	it('serves repeated config reads from the hydrated in-memory cache', async () => {
		const executor = new CountingInMemoryCassandraQueryExecutor();
		setCassandraQueryExecutorForTesting(executor);
		const kvProvider = new MockKVProvider();
		const repository = createRepository(kvProvider);

		await repository.setRegistrationConfig({mode: 'closed'});
		executor.instanceConfigSelects = 0;

		expect(await repository.getRegistrationConfig()).toEqual({
			mode: 'closed',
			admin_registration_urls_enabled: true,
		} satisfies InstanceRegistrationConfig);
		expect(await repository.getRegistrationConfig()).toEqual({
			mode: 'closed',
			admin_registration_urls_enabled: true,
		} satisfies InstanceRegistrationConfig);
		expect(executor.instanceConfigSelects).toBe(0);
		expect(kvProvider.getSubscription().subscribedChannels).toContain(INSTANCE_CONFIG_REFRESH_CHANNEL);
	});

	it('refreshes a hydrated cache after another repository publishes a config update', async () => {
		const executor = new CountingInMemoryCassandraQueryExecutor();
		setCassandraQueryExecutorForTesting(executor);
		const kvProvider = new MockKVProvider();
		const reader = createRepository(kvProvider);
		const writer = createRepository(kvProvider);

		expect(await reader.getRegistrationConfig()).toEqual({
			mode: 'open',
			admin_registration_urls_enabled: true,
		} satisfies InstanceRegistrationConfig);

		await writer.setRegistrationConfig({mode: 'approval'});

		await vi.waitFor(async () => {
			expect(await reader.getRegistrationConfig()).toEqual({
				mode: 'approval',
				admin_registration_urls_enabled: true,
			} satisfies InstanceRegistrationConfig);
		});
	});

	it('uses the registration URL id as the admin-visible registration code', async () => {
		const executor = new CountingInMemoryCassandraQueryExecutor();
		setCassandraQueryExecutorForTesting(executor);
		const kvProvider = new MockKVProvider();
		const repository = createRepository(kvProvider);

		const created = await repository.createRegistrationUrl({
			label: 'Support invite',
			createdByUserId: '1500000000000000000',
			expiresAt: null,
			maxUses: null,
			approvalRequired: false,
		});

		expect(created.code).toBe(created.registrationUrl.id);
		expect(created.registrationUrl).not.toHaveProperty('code_hash');
		await expect(repository.resolveRegistrationUrlCode(created.registrationUrl.id)).resolves.toMatchObject({
			id: created.registrationUrl.id,
		});
	});

	it('prefers environment email settings over stored instance config on self-hosted deployments', async () => {
		const executor = new CountingInMemoryCassandraQueryExecutor();
		setCassandraQueryExecutorForTesting(executor);
		const kvProvider = new MockKVProvider();
		const repository = createRepository(kvProvider);
		const config = getConfig();
		const originalSelfHosted = config.instance.selfHosted;
		const originalEmail = structuredClone(config.email);
		try {
			config.instance.selfHosted = true;
			config.email = {
				...originalEmail,
				enabled: true,
				provider: 'smtp',
				fromEmail: 'noreply@env.example',
				fromName: 'Env Mailer',
				smtp: {
					host: 'smtp.env.example',
					port: 465,
					username: 'env-user',
					password: 'env-password',
					secure: true,
				},
			};
			await repository.setInstanceIntegrationsConfig({
				email: {
					enabled: false,
					provider: 'none',
					from_email: 'noreply@kv.example',
					from_name: 'KV Mailer',
					smtp: {
						host: 'smtp.kv.example',
						port: 587,
						username: 'kv-user',
						password: 'kv-password',
						secure: false,
					},
				},
			});
			await expect(repository.getEffectiveEmailConfig()).resolves.toMatchObject({
				enabled: true,
				provider: 'smtp',
				fromEmail: 'noreply@env.example',
				fromName: 'Env Mailer',
				smtp: {
					host: 'smtp.env.example',
					port: 465,
					username: 'env-user',
					password: 'env-password',
					secure: true,
				},
			});
		} finally {
			config.instance.selfHosted = originalSelfHosted;
			config.email = originalEmail;
		}
	});

	it('does not persist integration secrets to instance config on self-hosted deployments', async () => {
		const executor = new CountingInMemoryCassandraQueryExecutor();
		setCassandraQueryExecutorForTesting(executor);
		const kvProvider = new MockKVProvider();
		const repository = createRepository(kvProvider);
		const config = getConfig();
		const originalSelfHosted = config.instance.selfHosted;
		try {
			config.instance.selfHosted = true;
			await repository.setInstanceIntegrationsConfig({
				email: {
					smtp: {
						password: 'stored-password',
					},
				},
			});
			const stored = await repository.getInstanceIntegrationsConfig();
			expect(stored.email.smtp.password).toBeNull();
		} finally {
			config.instance.selfHosted = originalSelfHosted;
		}
	});

	it('enables ALTCHA from environment settings on self-hosted deployments', async () => {
		const executor = new CountingInMemoryCassandraQueryExecutor();
		setCassandraQueryExecutorForTesting(executor);
		const kvProvider = new MockKVProvider();
		const repository = createRepository(kvProvider);
		const config = getConfig();
		const originalSelfHosted = config.instance.selfHosted;
		const originalCaptcha = structuredClone(config.captcha);
		const originalApiPublic = config.endpoints.apiPublic;
		try {
			config.instance.selfHosted = true;
			config.endpoints.apiPublic = 'https://chat.example.com/api';
			config.captcha = {
				enabled: true,
				provider: 'altcha',
				altcha: {
					hmacSecret: 'env-altcha-secret',
				},
			};
			await repository.setInstanceIntegrationsConfig({
				captcha: {
					provider: 'none',
					altcha_hmac_secret: 'kv-altcha-secret',
				},
			});
			await expect(repository.getEffectiveCaptchaConfig()).resolves.toMatchObject({
				enabled: true,
				provider: 'altcha',
				altcha_hmac_secret_key: 'env-altcha-secret',
				altcha_challenge_url: 'https://chat.example.com/api/altcha/challenge',
			});
		} finally {
			config.instance.selfHosted = originalSelfHosted;
			config.captcha = originalCaptcha;
			config.endpoints.apiPublic = originalApiPublic;
		}
	});

	it('resolves effective sentry config from environment on self-hosted deployments', async () => {
		const executor = new CountingInMemoryCassandraQueryExecutor();
		setCassandraQueryExecutorForTesting(executor);
		const kvProvider = new MockKVProvider();
		const repository = createRepository(kvProvider);
		const config = getConfig();
		const originalSelfHosted = config.instance.selfHosted;
		const originalSentry = structuredClone(config.sentry);
		try {
			config.instance.selfHosted = true;
			config.sentry = {
				enabled: true,
				clientEnabled: true,
				dsn: 'https://0123456789abcdef0123456789abcdef@glitchtip.example.com/1',
				environment: 'staging',
			};
			await repository.setInstanceIntegrationsConfig({
				sentry: {
					enabled: false,
					client_enabled: false,
					dsn: 'https://0123456789abcdef0123456789abcdef@ignored.example.com/2',
					environment: 'ignored',
				},
			});
			await expect(repository.getEffectiveSentryConfig()).resolves.toMatchObject({
				enabled: true,
				clientEnabled: true,
				dsn: 'https://0123456789abcdef0123456789abcdef@glitchtip.example.com/1',
				environment: 'staging',
			});
		} finally {
			config.instance.selfHosted = originalSelfHosted;
			config.sentry = originalSentry;
		}
	});

	it('persists sentry DSN in instance config on self-hosted deployments', async () => {
		const executor = new CountingInMemoryCassandraQueryExecutor();
		setCassandraQueryExecutorForTesting(executor);
		const kvProvider = new MockKVProvider();
		const repository = createRepository(kvProvider);
		const config = getConfig();
		const originalSelfHosted = config.instance.selfHosted;
		try {
			config.instance.selfHosted = true;
			await repository.setInstanceIntegrationsConfig({
				sentry: {
					dsn: 'https://0123456789abcdef0123456789abcdef@glitchtip.example.com/1',
				},
			});
			const stored = await repository.getInstanceIntegrationsConfig();
			expect(stored.sentry.dsn).toBe('https://0123456789abcdef0123456789abcdef@glitchtip.example.com/1');
		} finally {
			config.instance.selfHosted = originalSelfHosted;
		}
	});
});
