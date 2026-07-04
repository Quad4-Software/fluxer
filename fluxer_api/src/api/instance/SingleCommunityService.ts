// SPDX-License-Identifier: AGPL-3.0-or-later

import {JoinSourceTypes} from '@fluxer/constants/src/GuildConstants';
import {createGuildID, type GuildID, type UserID} from '../BrandedTypes';
import type {GuildDataService} from '../guild/services/GuildDataService';
import type {GuildMemberService} from '../guild/services/GuildMemberService';
import {Logger} from '../Logger';
import type {RequestCache} from '../middleware/RequestCacheMiddleware';
import type {User} from '../models/User';
import type {InstanceConfigRepository} from './InstanceConfigRepository';

export class SingleCommunityService {
	constructor(
		private readonly instanceConfigRepository: InstanceConfigRepository,
		private readonly guildDataService: GuildDataService,
		private readonly guildMemberService: GuildMemberService,
	) {}

	async getStockCommunityId(): Promise<GuildID | null> {
		const policy = await this.instanceConfigRepository.getInstancePolicyConfig();
		if (!policy.single_community_enabled || !policy.single_community_guild_id) {
			return null;
		}
		try {
			return createGuildID(BigInt(policy.single_community_guild_id));
		} catch {
			return null;
		}
	}

	async joinStockCommunity(userId: UserID, requestCache: RequestCache): Promise<void> {
		const guildId = await this.getStockCommunityId();
		if (!guildId) {
			return;
		}
		try {
			await this.guildMemberService.addUserToGuild({
				userId,
				guildId,
				skipGuildLimitCheck: true,
				skipBanCheck: true,
				joinSourceType: JoinSourceTypes.ADMIN_FORCE_ADD,
				requestCache,
			});
		} catch (error) {
			Logger.warn(
				{userId: userId.toString(), guildId: guildId.toString(), error},
				'Failed to auto-join stock community',
			);
		}
	}

	async createStockCommunity(params: {owner: User; name: string}): Promise<GuildID> {
		const guild = await this.guildDataService.createGuild({user: params.owner, data: {name: params.name}});
		const guildId = createGuildID(BigInt(guild.id));
		await this.instanceConfigRepository.setInstancePolicyConfig({
			single_community_enabled: true,
			single_community_locked: false,
			single_community_guild_id: guildId.toString(),
		});
		return guildId;
	}

	async enableStockCommunity(params: {owner: User; name: string; existingGuildId: GuildID | null}): Promise<GuildID> {
		if (params.existingGuildId && (await this.guildStillExists(params.existingGuildId))) {
			await this.instanceConfigRepository.setInstancePolicyConfig({
				single_community_enabled: true,
				single_community_locked: false,
				single_community_guild_id: params.existingGuildId.toString(),
			});
			return params.existingGuildId;
		}
		if (params.existingGuildId) {
			Logger.warn(
				{guildId: params.existingGuildId.toString()},
				'Previous single community guild no longer exists, creating a new stock community',
			);
		}
		return this.createStockCommunity({owner: params.owner, name: params.name});
	}

	private async guildStillExists(guildId: GuildID): Promise<boolean> {
		try {
			await this.guildDataService.getGuildSystem(guildId);
			return true;
		} catch {
			return false;
		}
	}
}
