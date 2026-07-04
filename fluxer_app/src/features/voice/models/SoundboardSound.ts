// SPDX-License-Identifier: AGPL-3.0-or-later

import type {GuildSoundboardSoundResponse} from '@fluxer/schema/src/domains/guild/GuildSoundboardSchemas';

export class SoundboardSound {
	readonly id: string;
	readonly guildId: string | null;
	readonly name: string;
	readonly emojiName: string | null;
	readonly url: string | null;
	readonly durationMs: number;
	readonly volume: number;
	readonly creatorId: string | null;
	readonly available: boolean;
	readonly createdAt: string | null;

	private constructor(params: {
		id: string;
		guildId: string | null;
		name: string;
		emojiName: string | null;
		url: string | null;
		durationMs: number;
		volume: number;
		creatorId: string | null;
		available: boolean;
		createdAt: string | null;
	}) {
		this.id = params.id;
		this.guildId = params.guildId;
		this.name = params.name;
		this.emojiName = params.emojiName;
		this.url = params.url;
		this.durationMs = params.durationMs;
		this.volume = params.volume;
		this.creatorId = params.creatorId;
		this.available = params.available;
		this.createdAt = params.createdAt;
	}

	static fromGuildSound(guildId: string, data: GuildSoundboardSoundResponse): SoundboardSound {
		return new SoundboardSound({
			id: data.id,
			guildId,
			name: data.name,
			emojiName: data.emoji_name,
			url: data.url,
			durationMs: data.duration_ms,
			volume: data.volume,
			creatorId: data.creator_id,
			available: data.available,
			createdAt: data.created_at,
		});
	}
}
