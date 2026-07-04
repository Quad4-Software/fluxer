// SPDX-License-Identifier: AGPL-3.0-or-later

import type {GuildReadyData} from '@app/features/gateway/types/GatewayGuildTypes';
import {ComponentDispatch} from '@app/features/platform/utils/ComponentBus';
import {SoundboardSound} from '@app/features/voice/models/SoundboardSound';
import {DEFAULT_SOUNDBOARD_SOUNDS} from '@fluxer/constants/src/DefaultSoundboardSounds';
import type {GuildSoundboardSoundResponse} from '@fluxer/schema/src/domains/guild/GuildSoundboardSchemas';
import {makeAutoObservable} from 'mobx';

const DEFAULT_SOUNDS: ReadonlyArray<SoundboardSound> = Object.freeze(
	DEFAULT_SOUNDBOARD_SOUNDS.map((sound) => SoundboardSound.fromDefault(sound)),
);

class Soundboard {
	guildSounds: Map<string, Array<SoundboardSound>> = new Map();
	soundById: Map<string, SoundboardSound> = new Map();

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
	}

	get defaultSounds(): ReadonlyArray<SoundboardSound> {
		return DEFAULT_SOUNDS;
	}

	getDefaultSound(soundId: string): SoundboardSound | null {
		return DEFAULT_SOUNDS.find((sound) => sound.id === soundId) ?? null;
	}

	getGuildSounds(guildId: string): ReadonlyArray<SoundboardSound> {
		return this.guildSounds.get(guildId) ?? [];
	}

	getSound(soundId: string, guildId?: string | null): SoundboardSound | null {
		const defaultSound = this.getDefaultSound(soundId);
		if (defaultSound) return defaultSound;
		if (guildId) {
			const inGuild = this.getGuildSounds(guildId).find((sound) => sound.id === soundId);
			if (inGuild) return inGuild;
		}
		return this.soundById.get(soundId) ?? null;
	}

	handleGuildCreate(data: GuildReadyData): void {
		if (data.soundboard_sounds && data.soundboard_sounds.length > 0) {
			this.updateGuildSounds(data.id, data.soundboard_sounds);
		}
	}

	handleGuildSoundboardSoundsUpdate(guildId: string, sounds: ReadonlyArray<GuildSoundboardSoundResponse>): void {
		this.updateGuildSounds(guildId, sounds);
	}

	handleGuildDelete(guildId: string): void {
		const oldSounds = this.guildSounds.get(guildId) ?? [];
		for (const sound of oldSounds) {
			this.soundById.delete(sound.id);
		}
		this.guildSounds.delete(guildId);
		ComponentDispatch.dispatch('SOUNDBOARD_RERENDER');
	}

	private updateGuildSounds(guildId: string, sounds: ReadonlyArray<GuildSoundboardSoundResponse>): void {
		const records = sounds.map((sound) => SoundboardSound.fromGuildSound(guildId, sound));
		records.sort((a, b) => a.name.localeCompare(b.name));
		const oldSounds = this.guildSounds.get(guildId) ?? [];
		for (const sound of oldSounds) {
			this.soundById.delete(sound.id);
		}
		this.guildSounds.set(guildId, records);
		for (const sound of records) {
			this.soundById.set(sound.id, sound);
		}
		ComponentDispatch.dispatch('SOUNDBOARD_RERENDER');
	}
}

export default new Soundboard();
