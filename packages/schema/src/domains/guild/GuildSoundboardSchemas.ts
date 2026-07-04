// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	SOUNDBOARD_SOUND_EXTENSIONS,
	SOUNDBOARD_SOUND_MAX_BYTES,
	SOUNDBOARD_SOUND_MAX_DURATION_MS,
	SOUNDBOARD_SOUND_NAME_MAX_LENGTH,
	SOUNDBOARD_SOUND_NAME_MIN_LENGTH,
} from '@fluxer/constants/src/SoundboardConstants';
import {createBase64StringType} from '@fluxer/schema/src/primitives/FileValidators';
import {createStringType, SnowflakeStringType, SnowflakeType} from '@fluxer/schema/src/primitives/SchemaPrimitives';
import {z} from 'zod';

function toNonEmptyStringTuple<TValue extends string>(values: ReadonlyArray<TValue>): [TValue, ...Array<TValue>] {
	const [first, ...rest] = values;
	if (first === undefined) {
		throw new Error('Expected at least one enum value');
	}
	return [first, ...rest];
}

const SoundboardSoundExtensionValues = toNonEmptyStringTuple(SOUNDBOARD_SOUND_EXTENSIONS);

const SOUNDBOARD_SOUND_BASE64_MAX_CHARS = Math.ceil((SOUNDBOARD_SOUND_MAX_BYTES * 4) / 3) + 32;

const EmojiNameSchema = createStringType(1, 32).nullable().optional().describe('Emoji shown on the soundboard tile');

const VolumeSchema = z.number().min(0).max(2).describe('Playback volume multiplier, 0-2');

export const GuildSoundboardSoundCreateRequest = z.object({
	name: createStringType(SOUNDBOARD_SOUND_NAME_MIN_LENGTH, SOUNDBOARD_SOUND_NAME_MAX_LENGTH).describe(
		'Display label for the sound',
	),
	emoji_name: EmojiNameSchema,
	sound: createBase64StringType(1, SOUNDBOARD_SOUND_BASE64_MAX_CHARS).describe('Base64-encoded audio bytes'),
	volume: VolumeSchema.optional(),
});

export type GuildSoundboardSoundCreateRequest = z.infer<typeof GuildSoundboardSoundCreateRequest>;

export const GuildSoundboardSoundUpdateRequest = z.object({
	name: createStringType(SOUNDBOARD_SOUND_NAME_MIN_LENGTH, SOUNDBOARD_SOUND_NAME_MAX_LENGTH).optional(),
	emoji_name: EmojiNameSchema,
	volume: VolumeSchema.optional(),
});

export type GuildSoundboardSoundUpdateRequest = z.infer<typeof GuildSoundboardSoundUpdateRequest>;

export const GuildSoundboardSoundResponse = z.object({
	id: SnowflakeStringType,
	guild_id: SnowflakeStringType,
	name: z.string(),
	emoji_name: z.string().nullable(),
	extension: z.enum(SoundboardSoundExtensionValues),
	content_type: z.string(),
	duration_ms: z.number().int().min(0).max(SOUNDBOARD_SOUND_MAX_DURATION_MS),
	size_bytes: z.number().int().min(0).max(SOUNDBOARD_SOUND_MAX_BYTES),
	volume: z.number(),
	url: z.string().url(),
	creator_id: SnowflakeStringType,
	available: z.boolean(),
	created_at: z.string().datetime(),
});

export type GuildSoundboardSoundResponse = z.infer<typeof GuildSoundboardSoundResponse>;

export const GuildSoundboardSoundListResponse = z.array(GuildSoundboardSoundResponse);

export type GuildSoundboardSoundListResponse = z.infer<typeof GuildSoundboardSoundListResponse>;

export const SoundboardSoundPlayRequest = z.object({
	sound_id: SnowflakeType.describe('ID of the soundboard sound to play'),
	source_guild_id: SnowflakeType.nullable()
		.optional()
		.describe('Guild the sound belongs to, required when playing a sound from another guild'),
});

export type SoundboardSoundPlayRequest = z.infer<typeof SoundboardSoundPlayRequest>;
