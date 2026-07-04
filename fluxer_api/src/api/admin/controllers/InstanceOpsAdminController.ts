// SPDX-License-Identifier: AGPL-3.0-or-later

import {AdminACLs} from '@fluxer/constants/src/AdminACLs';
import {
	InstanceHealthResponse,
	InstanceIntegrationTestResponse,
	InstanceS3IntegrationTestRequest,
	type InstanceServiceHealthStatus,
} from '@fluxer/schema/src/domains/admin/AdminSchemas';
import {getDefaultPostgresClient} from '@pkgs/postgres/src/Client';
import {createMiddleware} from 'hono/factory';
import {Config} from '../../Config';
import {requireAdminACL} from '../../middleware/AdminMiddleware';
import {RateLimitMiddleware} from '../../middleware/RateLimitMiddleware';
import {OpenAPI} from '../../middleware/ResponseTypeMiddleware';
import {getKVClient, getLiveKitServiceInstance} from '../../middleware/ServiceRegistry';
import {RateLimitConfigs} from '../../RateLimitConfig';
import type {HonoApp} from '../../types/HonoEnv';
import {Validator} from '../../Validator';

interface ProbeResult {
	ok: boolean;
	latencyMs: number | null;
	detail: string | null;
}

async function probeHttp(url: string, timeoutMs = 5000): Promise<ProbeResult> {
	const startedAt = Date.now();
	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), timeoutMs);
		const response = await fetch(url, {signal: controller.signal});
		clearTimeout(timeout);
		return {
			ok: response.ok,
			latencyMs: Date.now() - startedAt,
			detail: response.ok ? null : `HTTP ${response.status}`,
		};
	} catch (error) {
		return {
			ok: false,
			latencyMs: Date.now() - startedAt,
			detail: error instanceof Error ? error.message : String(error),
		};
	}
}

function natsMonitoringUrl(coreUrl: string): string {
	const parsed = new URL(coreUrl.replace(/^nats:\/\//, 'http://'));
	return `http://${parsed.hostname}:8222/healthz`;
}

function requireSelfHosted() {
	return createMiddleware(async (ctx, next) => {
		if (!Config.instance.selfHosted) {
			return ctx.json({error: 'not_available'}, 404);
		}
		return await next();
	});
}

export function InstanceOpsAdminController(app: HonoApp) {
	app.get(
		'/admin/instance-health',
		RateLimitMiddleware(RateLimitConfigs.ADMIN_LOOKUP),
		requireSelfHosted(),
		requireAdminACL(AdminACLs.INSTANCE_CONFIG_VIEW),
		OpenAPI({
			operationId: 'get_instance_health',
			summary: 'Get self-hosted instance health',
			description:
				'Reports dependency and edge service health for self-hosted operators. Requires INSTANCE_CONFIG_VIEW permission.',
			responseSchema: InstanceHealthResponse,
			statusCode: 200,
			security: 'adminApiKey',
			tags: 'Admin',
		}),
		async (ctx) => {
			const services: Array<InstanceServiceHealthStatus> = [];

			const postgresStartedAt = Date.now();
			try {
				if (Config.database.backend === 'postgres') {
					await getDefaultPostgresClient().query('SELECT 1');
					services.push({
						name: 'postgres',
						ok: true,
						latency_ms: Date.now() - postgresStartedAt,
						detail: null,
					});
				} else {
					services.push({
						name: 'postgres',
						ok: false,
						latency_ms: null,
						detail: 'Postgres is not the active database backend',
					});
				}
			} catch (error) {
				services.push({
					name: 'postgres',
					ok: false,
					latency_ms: Date.now() - postgresStartedAt,
					detail: error instanceof Error ? error.message : String(error),
				});
			}

			const kvStartedAt = Date.now();
			try {
				const ok = await getKVClient().health();
				services.push({
					name: 'valkey',
					ok,
					latency_ms: Date.now() - kvStartedAt,
					detail: ok ? null : 'PING failed',
				});
			} catch (error) {
				services.push({
					name: 'valkey',
					ok: false,
					latency_ms: Date.now() - kvStartedAt,
					detail: error instanceof Error ? error.message : String(error),
				});
			}

			const natsProbe = await probeHttp(natsMonitoringUrl(Config.nats.coreUrl));
			services.push({name: 'nats', ...toServiceStatus(natsProbe)});

			const meiliHeaders: Record<string, string> = {};
			if (Config.search.apiKey) {
				meiliHeaders.Authorization = `Bearer ${Config.search.apiKey}`;
			}
			const meiliStartedAt = Date.now();
			try {
				const response = await fetch(`${Config.search.url.replace(/\/$/, '')}/health`, {
					headers: meiliHeaders,
				});
				const body = await response.text();
				const ok = response.ok && body.includes('available');
				services.push({
					name: 'meilisearch',
					ok,
					latency_ms: Date.now() - meiliStartedAt,
					detail: ok ? null : `HTTP ${response.status}`,
				});
			} catch (error) {
				services.push({
					name: 'meilisearch',
					ok: false,
					latency_ms: Date.now() - meiliStartedAt,
					detail: error instanceof Error ? error.message : String(error),
				});
			}

			const apiProbe = await probeHttp(`http://127.0.0.1:${Config.port}/_health`);
			services.push({name: 'api', ...toServiceStatus(apiProbe)});

			const gatewayProbe = await probeHttp(`${Config.internal.gateway.replace(/\/$/, '')}/_health`);
			services.push({name: 'gateway', ...toServiceStatus(gatewayProbe)});

			const mediaProxyUrl = `http://${Config.mediaProxy.host}:${Config.mediaProxy.port}/_health`;
			const mediaProxyProbe = await probeHttp(mediaProxyUrl);
			services.push({name: 'media-proxy', ...toServiceStatus(mediaProxyProbe)});

			const activeJobs = await ctx.get('adminService').jobAdminService.listActiveJobs();
			const queued = activeJobs.jobs.filter((job) => job.status === 'queued').length;
			const running = activeJobs.jobs.filter((job) => job.status === 'running').length;

			return ctx.json({
				checked_at: new Date().toISOString(),
				services,
				active_jobs: {queued, running},
			});
		},
	);

	app.post(
		'/admin/instance-config/integrations/s3/test',
		RateLimitMiddleware(RateLimitConfigs.ADMIN_USER_MODIFY),
		requireSelfHosted(),
		requireAdminACL(AdminACLs.INSTANCE_CONFIG_UPDATE),
		Validator('json', InstanceS3IntegrationTestRequest),
		OpenAPI({
			operationId: 'test_instance_s3_config',
			summary: 'Validate S3 object storage',
			description:
				'Uploads and deletes a small test object in the configured uploads bucket. Requires INSTANCE_CONFIG_UPDATE permission.',
			responseSchema: InstanceIntegrationTestResponse,
			statusCode: 200,
			security: 'adminApiKey',
			tags: 'Admin',
		}),
		async (ctx) => {
			const bucket = ctx.req.valid('json').bucket ?? Config.s3.buckets.uploads;
			const key = `.fluxer-admin-health-check/${Date.now()}`;
			const storageService = ctx.get('storageService');
			try {
				await storageService.uploadObject({
					bucket,
					key,
					body: new TextEncoder().encode('fluxer-health-check'),
					contentType: 'text/plain',
				});
				await storageService.deleteObject(bucket, key);
				return ctx.json({
					ok: true,
					error: null,
					detail: `Uploaded and deleted test object in ${bucket}`,
				});
			} catch (error) {
				return ctx.json({
					ok: false,
					error: error instanceof Error ? error.message : String(error),
					detail: null,
				});
			}
		},
	);

	app.post(
		'/admin/instance-config/integrations/livekit/test',
		RateLimitMiddleware(RateLimitConfigs.ADMIN_USER_MODIFY),
		requireSelfHosted(),
		requireAdminACL(AdminACLs.INSTANCE_CONFIG_UPDATE),
		OpenAPI({
			operationId: 'test_instance_livekit_config',
			summary: 'Validate LiveKit connectivity',
			description:
				'Lists rooms on configured LiveKit servers to verify API credentials and reachability. Requires INSTANCE_CONFIG_UPDATE permission.',
			responseSchema: InstanceIntegrationTestResponse,
			statusCode: 200,
			security: 'adminApiKey',
			tags: 'Admin',
		}),
		async (ctx) => {
			if (!Config.voice.enabled) {
				return ctx.json({
					ok: false,
					error: 'Voice is not enabled on this instance',
					detail: null,
				});
			}
			try {
				const liveKitService = getLiveKitServiceInstance();
				if (!liveKitService) {
					return ctx.json({
						ok: false,
						error: 'LiveKit service is not initialized',
						detail: null,
					});
				}
				const result = await liveKitService.listActiveRooms();
				if (!result.completed) {
					const firstError = result.errors[0];
					return ctx.json({
						ok: false,
						error: firstError?.errorCode ?? 'LiveKit request failed',
						detail: `Checked ${result.searchedServers} server(s)`,
					});
				}
				return ctx.json({
					ok: true,
					error: null,
					detail: `Connected to ${result.searchedServers} LiveKit server(s); ${result.rooms.length} active room(s)`,
				});
			} catch (error) {
				return ctx.json({
					ok: false,
					error: error instanceof Error ? error.message : String(error),
					detail: null,
				});
			}
		},
	);
}

function toServiceStatus(probe: ProbeResult): {
	ok: boolean;
	latency_ms: number | null;
	detail: string | null;
} {
	return {
		ok: probe.ok,
		latency_ms: probe.latencyMs,
		detail: probe.detail,
	};
}
