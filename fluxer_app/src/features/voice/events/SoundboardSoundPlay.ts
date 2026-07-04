// SPDX-License-Identifier: AGPL-3.0-or-later

import type {GatewayHandlerContext} from '@app/features/gateway/events/EventRouter';
import {Logger} from '@app/features/platform/utils/AppLogger';
import MediaEngine from '@app/features/voice/engine/MediaEngineFacade';
import SoundboardPlaybackEngine from '@app/features/voice/engine/SoundboardPlaybackEngine';
import {findDefaultSoundboardSound} from '@fluxer/constants/src/DefaultSoundboardSounds';
import type {GuildSoundboardSoundResponse} from '@fluxer/schema/src/domains/guild/GuildSoundboardSchemas';

const logger = new Logger('SoundboardSoundPlay');

interface SoundboardSoundPlayPayload {
	user_id: string;
	channel_id: string;
	guild_id: string;
	sound_id: string;
	is_default: boolean;
	source_guild_id?: string | null;
	sound?: GuildSoundboardSoundResponse;
}

export function handleSoundboardSoundPlay(data: SoundboardSoundPlayPayload, _context: GatewayHandlerContext): void {
	if (!MediaEngine.connected) return;
	if (MediaEngine.channelId !== data.channel_id) {
		logger.debug('Ignoring soundboard sound for a channel we are not in', {
			eventChannelId: data.channel_id,
			localChannelId: MediaEngine.channelId,
		});
		return;
	}
	if (data.is_default) {
		const recipe = findDefaultSoundboardSound(data.sound_id);
		if (!recipe) {
			logger.warn('Received SOUNDBOARD_SOUND_PLAY for unknown default sound', {soundId: data.sound_id});
			return;
		}
		void SoundboardPlaybackEngine.playDefault({soundId: data.sound_id, recipe});
		return;
	}
	if (!data.sound?.url) {
		logger.warn('Received SOUNDBOARD_SOUND_PLAY without a resolvable sound', {soundId: data.sound_id});
		return;
	}
	void SoundboardPlaybackEngine.playCustom({
		soundId: data.sound_id,
		url: data.sound.url,
		volume: data.sound.volume,
	});
}
