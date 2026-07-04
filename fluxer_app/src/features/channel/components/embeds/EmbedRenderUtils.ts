// SPDX-License-Identifier: AGPL-3.0-or-later

import {MessageEmbedTypes} from '@fluxer/constants/src/ChannelConstants';
import type {MessageEmbed} from '@fluxer/schema/src/domains/message/EmbedSchemas';

type RichEmbedContentFields = Pick<
	MessageEmbed,
	'title' | 'description' | 'author' | 'footer' | 'fields' | 'provider' | 'type'
>;

export function hasRichEmbedContent(embed: RichEmbedContentFields): boolean {
	return Boolean(
		embed.title != null ||
			embed.description ||
			embed.author ||
			embed.footer ||
			embed.fields?.length ||
			(embed.provider && embed.type !== MessageEmbedTypes.GIFV),
	);
}

type MediaOnlyEmbedFields = RichEmbedContentFields & Pick<MessageEmbed, 'image' | 'thumbnail' | 'video' | 'audio'>;

export function isMediaOnlyEmbed(embed: MediaOnlyEmbedFields): boolean {
	if (hasRichEmbedContent(embed)) return false;
	return Boolean(embed.image || embed.thumbnail || embed.video || embed.audio);
}

export function formatResponsiveEmbedWidth(width: number): string {
	const normalizedWidth = Number.isFinite(width) && width > 0 ? Math.round(width) : 0;
	return `min(100%, ${normalizedWidth}px)`;
}
