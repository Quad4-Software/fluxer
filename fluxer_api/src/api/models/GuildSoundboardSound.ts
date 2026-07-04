// SPDX-License-Identifier: AGPL-3.0-or-later

import type {GuildID, SoundboardSoundID, UserID} from '../BrandedTypes';
import type {GuildSoundboardSoundRow} from '../database/types/GuildTypes';

export class GuildSoundboardSound {
	readonly guildId: GuildID;
	readonly id: SoundboardSoundID;
	readonly name: string;
	readonly emojiName: string | null;
	readonly hash: string;
	readonly extension: string;
	readonly contentType: string;
	readonly durationMs: number;
	readonly sizeBytes: number;
	readonly volume: number;
	readonly creatorId: UserID;
	readonly available: boolean;
	readonly createdAt: Date;
	readonly version: number;

	constructor(row: GuildSoundboardSoundRow) {
		this.guildId = row.guild_id;
		this.id = row.sound_id;
		this.name = row.name;
		this.emojiName = row.emoji_name ?? null;
		this.hash = row.hash;
		this.extension = row.extension;
		this.contentType = row.content_type;
		this.durationMs = row.duration_ms;
		this.sizeBytes = row.size_bytes;
		this.volume = row.volume;
		this.creatorId = row.creator_id;
		this.available = row.available;
		this.createdAt = row.created_at;
		this.version = row.version;
	}

	toRow(): GuildSoundboardSoundRow {
		return {
			guild_id: this.guildId,
			sound_id: this.id,
			name: this.name,
			emoji_name: this.emojiName,
			hash: this.hash,
			extension: this.extension,
			content_type: this.contentType,
			duration_ms: this.durationMs,
			size_bytes: this.sizeBytes,
			volume: this.volume,
			creator_id: this.creatorId,
			available: this.available,
			created_at: this.createdAt,
			version: this.version,
		};
	}
}
