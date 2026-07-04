// SPDX-License-Identifier: AGPL-3.0-or-later

import {GuildIdParam, GuildIdSoundIdParam} from '@fluxer/schema/src/domains/common/CommonParamSchemas';
import {
	GuildSoundboardSoundCreateRequest,
	GuildSoundboardSoundListResponse,
	GuildSoundboardSoundResponse,
	GuildSoundboardSoundUpdateRequest,
} from '@fluxer/schema/src/domains/guild/GuildSoundboardSchemas';
import {createGuildID, createSoundboardSoundID} from '../../BrandedTypes';
import {LoginRequired} from '../../middleware/AuthMiddleware';
import {RateLimitMiddleware} from '../../middleware/RateLimitMiddleware';
import {OpenAPI} from '../../middleware/ResponseTypeMiddleware';
import {RateLimitConfigs} from '../../RateLimitConfig';
import type {HonoApp} from '../../types/HonoEnv';
import {Validator} from '../../Validator';

export function GuildSoundboardController(app: HonoApp) {
	app.get(
		'/guilds/:guild_id/soundboard-sounds',
		RateLimitMiddleware(RateLimitConfigs.GUILD_SOUNDBOARD_SOUNDS_LIST),
		LoginRequired,
		Validator('param', GuildIdParam),
		OpenAPI({
			operationId: 'list_guild_soundboard_sounds',
			summary: 'List guild soundboard sounds',
			description: 'List the custom soundboard sounds uploaded to this guild.',
			responseSchema: GuildSoundboardSoundListResponse,
			statusCode: 200,
			security: ['botToken', 'bearerToken', 'sessionToken'],
			tags: ['Guilds'],
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const guildId = createGuildID(ctx.req.valid('param').guild_id);
			return ctx.json(await ctx.get('guildService').content.getSoundboardSounds({userId, guildId}));
		},
	);
	app.post(
		'/guilds/:guild_id/soundboard-sounds',
		RateLimitMiddleware(RateLimitConfigs.GUILD_SOUNDBOARD_SOUND_CREATE),
		LoginRequired,
		Validator('param', GuildIdParam),
		Validator('json', GuildSoundboardSoundCreateRequest),
		OpenAPI({
			operationId: 'create_guild_soundboard_sound',
			summary: 'Create guild soundboard sound',
			description:
				'Upload a new soundboard sound to the guild. Requires create_expressions permission. Validates format, duration, and size server-side.',
			requestSchema: GuildSoundboardSoundCreateRequest,
			responseSchema: GuildSoundboardSoundResponse,
			statusCode: 201,
			security: ['botToken', 'bearerToken', 'sessionToken'],
			tags: ['Guilds'],
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const guildId = createGuildID(ctx.req.valid('param').guild_id);
			const {name, emoji_name, sound, volume} = ctx.req.valid('json');
			const auditLogReason = ctx.get('auditLogReason') ?? null;
			const created = await ctx
				.get('guildService')
				.content.createSoundboardSound(
					{userId, guildId, name, emojiName: emoji_name ?? null, sound, volume},
					auditLogReason,
				);
			return ctx.json(created, 201);
		},
	);
	app.patch(
		'/guilds/:guild_id/soundboard-sounds/:sound_id',
		RateLimitMiddleware(RateLimitConfigs.GUILD_SOUNDBOARD_SOUND_UPDATE),
		LoginRequired,
		Validator('param', GuildIdSoundIdParam),
		Validator('json', GuildSoundboardSoundUpdateRequest),
		OpenAPI({
			operationId: 'update_guild_soundboard_sound',
			summary: 'Update guild soundboard sound',
			description:
				'Update a soundboard sound. Requires create_expressions permission if you are the creator, otherwise manage_expressions.',
			requestSchema: GuildSoundboardSoundUpdateRequest,
			responseSchema: GuildSoundboardSoundResponse,
			statusCode: 200,
			security: ['botToken', 'bearerToken', 'sessionToken'],
			tags: ['Guilds'],
		}),
		async (ctx) => {
			const {guild_id, sound_id} = ctx.req.valid('param');
			const userId = ctx.get('user').id;
			const guildId = createGuildID(guild_id);
			const soundId = createSoundboardSoundID(sound_id);
			const {name, emoji_name, volume} = ctx.req.valid('json');
			const auditLogReason = ctx.get('auditLogReason') ?? null;
			return ctx.json(
				await ctx
					.get('guildService')
					.content.updateSoundboardSound(
						{userId, guildId, soundId, name, emojiName: emoji_name, volume},
						auditLogReason,
					),
			);
		},
	);
	app.delete(
		'/guilds/:guild_id/soundboard-sounds/:sound_id',
		RateLimitMiddleware(RateLimitConfigs.GUILD_SOUNDBOARD_SOUND_DELETE),
		LoginRequired,
		Validator('param', GuildIdSoundIdParam),
		OpenAPI({
			operationId: 'delete_guild_soundboard_sound',
			summary: 'Delete guild soundboard sound',
			description: 'Delete a soundboard sound from the guild.',
			responseSchema: null,
			statusCode: 204,
			security: ['botToken', 'bearerToken', 'sessionToken'],
			tags: ['Guilds'],
		}),
		async (ctx) => {
			const {guild_id, sound_id} = ctx.req.valid('param');
			const userId = ctx.get('user').id;
			const guildId = createGuildID(guild_id);
			const soundId = createSoundboardSoundID(sound_id);
			const auditLogReason = ctx.get('auditLogReason') ?? null;
			await ctx.get('guildService').content.deleteSoundboardSound({userId, guildId, soundId}, auditLogReason);
			return ctx.body(null, 204);
		},
	);
}
