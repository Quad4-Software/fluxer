// SPDX-License-Identifier: AGPL-3.0-or-later

import {Permissions} from '@fluxer/constants/src/ChannelConstants';
import {ValidationErrorCodes} from '@fluxer/constants/src/ValidationErrorCodes';
import {UnknownChannelError} from '@fluxer/errors/src/domains/channel/UnknownChannelError';
import {InputValidationError} from '@fluxer/errors/src/domains/core/InputValidationError';
import {UnknownGuildSoundboardSoundError} from '@fluxer/errors/src/domains/guild/UnknownGuildSoundboardSoundError';
import {type ChannelID, createUserID, type GuildID, type SoundboardSoundID} from '../../../BrandedTypes';
import type {IChannelRepository} from '../../../channel/IChannelRepository';
import type {IGatewayService} from '../../../infrastructure/IGatewayService';
import {Logger} from '../../../Logger';
import type {User} from '../../../models/User';
import {checkIsPremium} from '../../../user/UserHelpers';
import {requirePermission} from '../../../utils/PermissionUtils';
import type {IGuildRepositoryAggregate} from '../../repositories/IGuildRepositoryAggregate';
import {mapGuildSoundboardSoundToResponse, soundboardSoundCdnUrl} from './SoundboardService';

interface PlaySoundboardSoundParams {
	user: User;
	channelId: ChannelID;
	soundId: SoundboardSoundID;
	sourceGuildId: GuildID | null;
}

export class SoundboardPlayService {
	constructor(
		private readonly guildRepository: IGuildRepositoryAggregate,
		private readonly gatewayService: IGatewayService,
		private readonly channelRepository: IChannelRepository,
	) {}

	async play(params: PlaySoundboardSoundParams): Promise<void> {
		const {user, channelId, soundId, sourceGuildId} = params;
		const channel = await this.channelRepository.findUnique(channelId);
		if (!channel?.guildId) {
			throw new UnknownChannelError();
		}
		const guildId = channel.guildId;
		const {voiceStates} = await this.gatewayService.getVoiceStatesForChannel({guildId, channelId});
		const senderInChannel = voiceStates.some((state) => state.userId === user.id.toString());
		if (!senderInChannel) {
			throw InputValidationError.fromCode('channel_id', ValidationErrorCodes.SOUNDBOARD_SOUND_NOT_IN_VOICE_CHANNEL);
		}
		await requirePermission(this.gatewayService, {
			guildId,
			userId: user.id,
			channelId,
			permission: Permissions.SPEAK,
		});
		await requirePermission(this.gatewayService, {
			guildId,
			userId: user.id,
			channelId,
			permission: Permissions.USE_SOUNDBOARD,
		});
		const eventData = await this.buildEventData({user, guildId, channelId, soundId, sourceGuildId});
		const senderIdString = user.id.toString();
		const deliveredTo = new Set<string>();
		for (const state of voiceStates) {
			if (state.userId === senderIdString) continue;
			if (deliveredTo.has(state.userId)) continue;
			deliveredTo.add(state.userId);
			try {
				await this.gatewayService.dispatchPresence({
					userId: createUserID(BigInt(state.userId)),
					event: 'SOUNDBOARD_SOUND_PLAY',
					data: eventData,
				});
			} catch (error) {
				Logger.warn(
					{error, recipient: state.userId, channelId: channelId.toString()},
					'Failed to dispatch SOUNDBOARD_SOUND_PLAY',
				);
			}
		}
	}

	private async buildEventData(params: {
		user: User;
		guildId: GuildID;
		channelId: ChannelID;
		soundId: SoundboardSoundID;
		sourceGuildId: GuildID | null;
	}): Promise<Record<string, unknown>> {
		const {user, guildId, channelId, soundId, sourceGuildId} = params;
		const baseData = {
			user_id: user.id.toString(),
			channel_id: channelId.toString(),
			guild_id: guildId.toString(),
			sound_id: soundId.toString(),
		};
		const isExternal = sourceGuildId != null && sourceGuildId !== guildId;
		if (isExternal) {
			if (!checkIsPremium(user)) {
				throw InputValidationError.fromCode(
					'source_guild_id',
					ValidationErrorCodes.SOUNDBOARD_EXTERNAL_SOUNDS_REQUIRE_PREMIUM,
				);
			}
			await requirePermission(this.gatewayService, {
				guildId,
				userId: user.id,
				channelId,
				permission: Permissions.USE_EXTERNAL_SOUNDS,
			});
			const membership = await this.guildRepository.getMember(sourceGuildId, user.id);
			if (!membership) {
				throw InputValidationError.fromCode(
					'source_guild_id',
					ValidationErrorCodes.SOUNDBOARD_EXTERNAL_SOUNDS_REQUIRE_MEMBERSHIP,
				);
			}
		}
		const lookupGuildId = sourceGuildId ?? guildId;
		const sound = await this.guildRepository.getSoundboardSound(soundId, lookupGuildId);
		if (!sound) {
			throw new UnknownGuildSoundboardSoundError();
		}
		if (!sound.available) {
			throw InputValidationError.fromCode('sound_id', ValidationErrorCodes.SOUNDBOARD_SOUND_NOT_AVAILABLE);
		}
		const url = soundboardSoundCdnUrl(sound);
		return {
			...baseData,
			source_guild_id: sound.guildId.toString(),
			sound: mapGuildSoundboardSoundToResponse(sound, url),
		};
	}
}
