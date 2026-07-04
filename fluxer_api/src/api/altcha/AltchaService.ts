// SPDX-License-Identifier: AGPL-3.0-or-later

import {getAltchaChallengeStore} from '@pkgs/captcha/src/AltchaChallengeStore';
import {deriveKey} from 'altcha-lib/algorithms/pbkdf2';
import altchaHono from 'altcha-lib/frameworks/hono';
import type {Context} from 'hono';

type AltchaRuntime = ReturnType<typeof altchaHono.create>;

let runtime: AltchaRuntime | null = null;
let runtimeSecret: string | null = null;

async function getRuntime(hmacSecret: string): Promise<AltchaRuntime> {
	if (runtime && runtimeSecret === hmacSecret) {
		return runtime;
	}
	const hmacKeySignatureSecret = await altchaHono.deriveHmacKeySecret(hmacSecret);
	runtime = altchaHono.create({
		hmacSignatureSecret: hmacSecret,
		hmacKeySignatureSecret,
		deriveKey,
		createChallengeParameters: () => ({
			algorithm: 'PBKDF2/SHA-256',
			cost: 5_000,
			counter: altchaHono.randomInt(5_000, 10_000),
			expiresAt: new Date(Date.now() + 600_000),
		}),
		store: getAltchaChallengeStore(),
	});
	runtimeSecret = hmacSecret;
	return runtime;
}

export async function handleAltchaChallenge(ctx: Context, hmacSecret: string): Promise<Response> {
	const altcha = await getRuntime(hmacSecret);
	return altcha.challengeHandler(ctx);
}

export function resetAltchaServiceForTesting(): void {
	runtime = null;
	runtimeSecret = null;
}
