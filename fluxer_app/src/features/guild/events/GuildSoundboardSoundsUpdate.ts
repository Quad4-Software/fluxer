// SPDX-License-Identifier: AGPL-3.0-or-later

import type {GatewayHandlerContext} from '@app/features/gateway/events/EventRouter';
import Soundboard from '@app/features/voice/state/Soundboard';
import type {GuildSoundboardSoundResponse} from '@fluxer/schema/src/domains/guild/GuildSoundboardSchemas';

interface GuildSoundboardSoundsUpdatePayload {
	guild_id: string;
	sounds: ReadonlyArray<GuildSoundboardSoundResponse>;
}

export function handleGuildSoundboardSoundsUpdate(
	data: GuildSoundboardSoundsUpdatePayload,
	_context: GatewayHandlerContext,
): void {
	Soundboard.handleGuildSoundboardSoundsUpdate(data.guild_id, data.sounds);
}
