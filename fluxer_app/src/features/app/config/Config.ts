// SPDX-License-Identifier: AGPL-3.0-or-later

import * as v from 'valibot';

const buildInfoSchema = v.object({
	PUBLIC_BUILD_VERSION: v.nullish(v.string(), 'dev'),
	PUBLIC_BUILD_COMMIT: v.nullish(v.string(), 'dev'),
	PUBLIC_FORK_REPO_URL: v.nullish(v.string(), ''),
});
const buildInfo = v.parse(buildInfoSchema, {
	PUBLIC_BUILD_VERSION: import.meta.env.PUBLIC_BUILD_VERSION,
	PUBLIC_BUILD_COMMIT: import.meta.env.PUBLIC_BUILD_COMMIT,
	PUBLIC_FORK_REPO_URL: import.meta.env.PUBLIC_FORK_REPO_URL,
});
const bootstrap = typeof window !== 'undefined' ? window.__FLUXER_BOOTSTRAP__ : undefined;

if (!bootstrap) {
	throw new Error('window.__FLUXER_BOOTSTRAP__ is missing — app must be served by fluxer_app_proxy');
}

const runtime = bootstrap.config;

export default {
	PUBLIC_BUILD_VERSION: buildInfo.PUBLIC_BUILD_VERSION,
	PUBLIC_BUILD_COMMIT: buildInfo.PUBLIC_BUILD_COMMIT,
	PUBLIC_FORK_REPO_URL: buildInfo.PUBLIC_FORK_REPO_URL,
	PUBLIC_RELEASE_CHANNEL: runtime.releaseChannel,
	PUBLIC_BOOTSTRAP_API_ENDPOINT: runtime.bootstrapApiEndpoint,
	PUBLIC_BOOTSTRAP_API_PUBLIC_ENDPOINT: runtime.bootstrapApiPublicEndpoint ?? runtime.bootstrapApiEndpoint,
};
