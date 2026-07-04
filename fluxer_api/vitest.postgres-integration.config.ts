// SPDX-License-Identifier: AGPL-3.0-or-later

import tsconfigPaths from 'vite-tsconfig-paths';
import {configDefaults, defineConfig} from 'vitest/config';

export default defineConfig({
	root: process.cwd(),
	plugins: [tsconfigPaths()],
	cacheDir: './node_modules/.vitest-postgres-integration',
	test: {
		globals: true,
		environment: 'node',
		setupFiles: ['./src/api/test/Setup.ts'],
		include: ['src/api/database/PostgresKvQueryExecutor.Integration.test.ts'],
		exclude: [...configDefaults.exclude, 'pkgs/**', '../fluxer_desktop/**', '**/target/**'],
		pool: 'forks',
		fileParallelism: false,
		maxWorkers: 1,
		maxConcurrency: 1,
		isolate: true,
		testTimeout: 40000,
		hookTimeout: 20000,
		reporters: ['default'],
	},
});
