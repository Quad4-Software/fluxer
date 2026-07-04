// SPDX-License-Identifier: AGPL-3.0-or-later

import type {CaptchaProviderType, ICaptchaProvider, VerifyCaptchaParams} from '@pkgs/captcha/src/ICaptchaProvider';
import {deriveKey} from 'altcha-lib/algorithms/pbkdf2';
import altchaHono from 'altcha-lib/frameworks/hono';
import type {Store} from 'altcha-lib/frameworks/types';

export interface AltchaProviderOptions {
	hmacSecret: string;
	store?: Store;
}

export class AltchaProvider implements ICaptchaProvider {
	readonly type: CaptchaProviderType = 'altcha';
	private readonly hmacSecret: string;
	private readonly store?: Store;
	private hmacKeySignatureSecret: string | null = null;
	private runtime: ReturnType<typeof altchaHono.create> | null = null;

	constructor(options: AltchaProviderOptions) {
		this.hmacSecret = options.hmacSecret;
		this.store = options.store;
	}

	private async getHmacKeySignatureSecret(): Promise<string> {
		if (!this.hmacKeySignatureSecret) {
			this.hmacKeySignatureSecret = await altchaHono.deriveHmacKeySecret(this.hmacSecret);
		}
		return this.hmacKeySignatureSecret;
	}

	private async getRuntime(): Promise<ReturnType<typeof altchaHono.create>> {
		if (!this.runtime) {
			const hmacKeySignatureSecret = await this.getHmacKeySignatureSecret();
			this.runtime = altchaHono.create({
				hmacSignatureSecret: this.hmacSecret,
				hmacKeySignatureSecret,
				deriveKey,
				createChallengeParameters: () => ({
					algorithm: 'PBKDF2/SHA-256',
					cost: 5_000,
					expiresAt: new Date(Date.now() + 600_000),
				}),
				store: this.store,
			});
		}
		return this.runtime;
	}

	async verify(params: VerifyCaptchaParams): Promise<boolean> {
		const token = params.token.trim();
		if (!token) return false;
		let payload: unknown = token;
		try {
			payload = JSON.parse(token);
		} catch {
			// ALTCHA widgets submit a JSON string payload.
		}
		const runtime = await this.getRuntime();
		const hmacKeySignatureSecret = await this.getHmacKeySignatureSecret();
		const result = await runtime.verify(
			payload,
			deriveKey,
			this.hmacSecret,
			hmacKeySignatureSecret,
			this.store,
		);
		return result.verification?.verified === true;
	}
}
