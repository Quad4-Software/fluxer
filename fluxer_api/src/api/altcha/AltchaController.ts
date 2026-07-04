// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Hono} from 'hono';
import {Config} from '../Config';
import {RateLimitMiddleware} from '../middleware/RateLimitMiddleware';
import {OpenAPI} from '../middleware/ResponseTypeMiddleware';
import {RateLimitConfigs} from '../RateLimitConfig';
import type {HonoEnv} from '../types/HonoEnv';
import {handleAltchaChallenge} from './AltchaService';
import {z} from 'zod';

const AltchaChallengeResponseSchema = z.record(z.string(), z.unknown());

export function AltchaController(app: Hono<HonoEnv>): void {
	app.get(
		'/altcha/challenge',
		RateLimitMiddleware(RateLimitConfigs.INSTANCE_INFO),
		OpenAPI({
			operationId: 'get_altcha_challenge',
			summary: 'Get ALTCHA proof-of-work challenge',
			responseSchema: AltchaChallengeResponseSchema,
			statusCode: 200,
			security: [],
			tags: ['Instance'],
			description:
				'Returns a proof-of-work challenge for the ALTCHA widget. Used when captcha.provider is altcha.',
		}),
		async (ctx) => {
			const captcha = await ctx.get('instanceConfigRepository').getEffectiveCaptchaConfig();
			if (!captcha.enabled || captcha.provider !== 'altcha' || !captcha.altcha_hmac_secret_key) {
				return ctx.json({message: 'ALTCHA is not enabled for this instance'}, 404);
			}
			return handleAltchaChallenge(ctx, captcha.altcha_hmac_secret_key);
		},
	);
}

export function isAltchaConfigured(): boolean {
	return Boolean(Config.captcha.enabled && Config.captcha.provider === 'altcha' && Config.captcha.altcha?.hmacSecret);
}
