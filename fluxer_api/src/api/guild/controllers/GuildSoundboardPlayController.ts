// SPDX-License-Identifier: AGPL-3.0-or-later

import {ChannelIdParam} from '@fluxer/schema/src/domains/common/CommonParamSchemas';
import {SoundboardSoundPlayRequest} from '@fluxer/schema/src/domains/guild/GuildSoundboardSchemas';
import {createChannelID, createGuildID, createSoundboardSoundID} from '../../BrandedTypes';
import {DefaultUserOnly, LoginRequired} from '../../middleware/AuthMiddleware';
import {RateLimitMiddleware} from '../../middleware/RateLimitMiddleware';
import {OpenAPI} from '../../middleware/ResponseTypeMiddleware';
import {RateLimitConfigs} from '../../RateLimitConfig';
import type {HonoApp} from '../../types/HonoEnv';
import {Validator} from '../../Validator';

export function GuildSoundboardPlayController(app: HonoApp) {
	app.post(
		'/voice/channels/:channel_id/soundboard-sound',
		RateLimitMiddleware(RateLimitConfigs.VOICE_SOUNDBOARD_SOUND_PLAY),
		LoginRequired,
		DefaultUserOnly,
		Validator('param', ChannelIdParam),
		Validator('json', SoundboardSoundPlayRequest),
		OpenAPI({
			operationId: 'play_soundboard_sound',
			summary: 'Play a soundboard sound in a voice channel',
			description:
				'Requests that the API fan out a SOUNDBOARD_SOUND_PLAY gateway event to every other user currently connected to the voice channel. Default catalog sounds are synthesized locally by each client; custom guild sounds are fetched from CDN. No LiveKit track is published.',
			requestSchema: SoundboardSoundPlayRequest,
			responseSchema: null,
			statusCode: 204,
			security: ['bearerToken', 'sessionToken'],
			tags: ['Voice'],
		}),
		async (ctx) => {
			const user = ctx.get('user');
			const channelId = createChannelID(BigInt(ctx.req.valid('param').channel_id));
			const {sound_id, source_guild_id} = ctx.req.valid('json');
			const soundId = createSoundboardSoundID(sound_id);
			const sourceGuildId = source_guild_id != null ? createGuildID(source_guild_id) : null;
			const service = ctx.get('soundboardPlayService');
			await service.play({user, channelId, soundId, sourceGuildId});
			return ctx.body(null, 204);
		},
	);
}
