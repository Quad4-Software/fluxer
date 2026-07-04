// SPDX-License-Identifier: AGPL-3.0-or-later

import {Endpoints} from '@app/features/app/constants/Endpoints';
import {http} from '@app/features/platform/transport/RestTransport';
import {Logger} from '@app/features/platform/utils/AppLogger';
import type {GuildSoundboardSoundResponse} from '@fluxer/schema/src/domains/guild/GuildSoundboardSchemas';

const logger = new Logger('SoundboardCommands');

interface SoundboardSoundCreateRequest {
	name: string;
	emoji_name?: string | null;
	sound: string;
	volume?: number;
}

interface SoundboardSoundUpdateRequest {
	name?: string;
	emoji_name?: string | null;
	volume?: number;
}

export async function list(guildId: string): Promise<ReadonlyArray<GuildSoundboardSoundResponse>> {
	try {
		const response = await http.get<ReadonlyArray<GuildSoundboardSoundResponse>>(
			Endpoints.GUILD_SOUNDBOARD_SOUNDS(guildId),
		);
		return response.body;
	} catch (error) {
		logger.error(`Failed to list soundboard sounds for guild ${guildId}:`, error);
		throw error;
	}
}

export async function create(
	guildId: string,
	sound: SoundboardSoundCreateRequest,
): Promise<GuildSoundboardSoundResponse> {
	try {
		const response = await http.post<GuildSoundboardSoundResponse>(Endpoints.GUILD_SOUNDBOARD_SOUNDS(guildId), {
			body: sound,
		});
		return response.body;
	} catch (error) {
		logger.error(`Failed to create soundboard sound in guild ${guildId}:`, error);
		throw error;
	}
}

export async function update(
	guildId: string,
	soundId: string,
	data: SoundboardSoundUpdateRequest,
): Promise<GuildSoundboardSoundResponse> {
	try {
		const response = await http.patch<GuildSoundboardSoundResponse>(
			Endpoints.GUILD_SOUNDBOARD_SOUND(guildId, soundId),
			{body: data},
		);
		return response.body;
	} catch (error) {
		logger.error(`Failed to update soundboard sound ${soundId} in guild ${guildId}:`, error);
		throw error;
	}
}

export async function remove(guildId: string, soundId: string): Promise<void> {
	try {
		await http.delete(Endpoints.GUILD_SOUNDBOARD_SOUND(guildId, soundId));
	} catch (error) {
		logger.error(`Failed to remove soundboard sound ${soundId} from guild ${guildId}:`, error);
		throw error;
	}
}

export async function play(channelId: string, soundId: string, sourceGuildId?: string | null): Promise<void> {
	try {
		await http.post(Endpoints.VOICE_CHANNEL_SOUNDBOARD_SOUND(channelId), {
			body: {sound_id: soundId, source_guild_id: sourceGuildId ?? null},
		});
	} catch (error) {
		logger.error(`Failed to play soundboard sound ${soundId} in channel ${channelId}:`, error);
		throw error;
	}
}
