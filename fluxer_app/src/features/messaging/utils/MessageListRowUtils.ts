// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Channel} from '@app/features/channel/models/Channel';
import type React from 'react';
import type {Message} from '@app/features/messaging/models/MessagingMessage';
import type {ChannelMessages} from '@app/features/messaging/state/ChannelMessages';
import type {ChannelStreamItem} from '@app/features/messaging/utils/MessageGroupingUtils';
import {MessageTypes} from '@fluxer/constants/src/ChannelConstants';

const STREAM_TYPE_MESSAGE = 'MESSAGE';
const STREAM_TYPE_DIVIDER = 'DIVIDER';
const STREAM_TYPE_MESSAGE_GROUP_BLOCKED = 'MESSAGE_GROUP_BLOCKED';
const STREAM_TYPE_MESSAGE_GROUP_SPAMMER = 'MESSAGE_GROUP_SPAMMER';

const MESSAGE_HEIGHT_COZY_PX = 22;
const MESSAGE_HEIGHT_COMPACT_PX = 16;
const GROUP_SPACER_HALF_RATIO = 0.5;
const DATE_DIVIDER_SPACING_PX = 16;
const DIVIDER_HEIGHT_PX = 32;
const UNREAD_DIVIDER_HEIGHT_PX = 40;
const BLOCKED_GROUP_HEIGHT_PX = 56;
const BLOCKED_GROUP_MESSAGE_HEIGHT_PX = 20;
const ATTACHMENT_HEIGHT_ESTIMATE_PX = 200;
const EMBED_HEIGHT_ESTIMATE_PX = 180;

type MessageGroupKind = 'system' | 'regular';

export type MessageListRow =
	| {
			kind: 'groupSpacer';
			key: string;
			variant: 'full' | 'half';
	  }
	| {
			kind: 'divider';
			key: string;
			content: string;
			isUnread: boolean;
			isDate: boolean;
			spacing: number;
	  }
	| {
			kind: 'messageGroup';
			key: string;
			messages: Array<Message>;
			streamItems: Array<ChannelStreamItem>;
			flashKey?: number;
			unreadDividerBeforeMessageId: string | null;
	  }
	| {
			kind: 'blockedGroup';
			key: string;
			variant: 'blocked' | 'spammer';
			messageGroups: Array<ChannelStreamItem>;
			revealed: boolean;
	  };

export interface BuildMessageListRowsInput {
	channelStream: ReadonlyArray<ChannelStreamItem>;
	revealedMessageId: string | null;
	messageGroupSpacing: number;
	suppressUnreadIndicator?: boolean;
}

export interface EstimateMessageListRowHeightInput {
	compact: boolean;
	fontSize: number;
	messageGroupSpacing: number;
}

const isSystemMessage = (message: Message | undefined): boolean => {
	if (!message) return false;
	return message.type !== MessageTypes.DEFAULT && message.type !== MessageTypes.REPLY;
};

const getMessageGroupKind = (message: Message | undefined): MessageGroupKind => {
	return isSystemMessage(message) ? 'system' : 'regular';
};

const getUnreadDividerBeforeMessageId = (
	pendingStreamItems: ReadonlyArray<ChannelStreamItem>,
	suppressUnreadIndicator?: boolean,
): string | null => {
	if (suppressUnreadIndicator) {
		return null;
	}
	for (const item of pendingStreamItems) {
		if (item.showUnreadDividerBefore) {
			return (item.content as Message).id;
		}
	}
	return null;
};

export function buildMessageListRows({
	channelStream,
	revealedMessageId,
	messageGroupSpacing,
	suppressUnreadIndicator,
}: BuildMessageListRowsInput): Array<MessageListRow> {
	const rows: Array<MessageListRow> = [];
	let pendingMessages: Array<Message> = [];
	let pendingStreamItems: Array<ChannelStreamItem> = [];
	let pendingGroupId: string | undefined;
	let pendingFlashKey: number | undefined;
	let lastRenderedGroupKind: MessageGroupKind | null = null;
	let spacerCounter = 0;

	const pushSpacerIfNeeded = (nextKind: MessageGroupKind, keyBase: string, nextMessageHasUnreadDivider = false) => {
		if (messageGroupSpacing <= 0 || lastRenderedGroupKind == null) return;
		if (nextMessageHasUnreadDivider) return;
		const bothSystem = lastRenderedGroupKind === 'system' && nextKind === 'system';
		rows.push({
			kind: 'groupSpacer',
			key: `group-spacer-${keyBase}-${spacerCounter++}`,
			variant: bothSystem ? 'half' : 'full',
		});
	};

	const flushPendingGroup = () => {
		if (pendingMessages.length === 0) return;
		const groupKey = pendingGroupId ?? pendingMessages[0].id;
		const groupKind = getMessageGroupKind(pendingMessages[0]);
		const unreadDividerBeforeMessageId = getUnreadDividerBeforeMessageId(
			pendingStreamItems,
			suppressUnreadIndicator,
		);
		const firstMessageHasUnreadDivider = unreadDividerBeforeMessageId === pendingMessages[0].id;
		pushSpacerIfNeeded(groupKind, groupKey, firstMessageHasUnreadDivider);
		rows.push({
			kind: 'messageGroup',
			key: groupKey,
			messages: pendingMessages,
			streamItems: pendingStreamItems,
			flashKey: pendingFlashKey,
			unreadDividerBeforeMessageId,
		});
		lastRenderedGroupKind = groupKind;
		pendingMessages = [];
		pendingStreamItems = [];
		pendingGroupId = undefined;
		pendingFlashKey = undefined;
	};

	for (let i = 0; i < channelStream.length; i++) {
		const item = channelStream[i];
		if (item.type !== STREAM_TYPE_MESSAGE) {
			flushPendingGroup();
			if (item.type === STREAM_TYPE_DIVIDER) {
				const isUnread = item.unreadId != null && !suppressUnreadIndicator;
				const isDateDivider = !!item.content;
				const dividerSpacing = isDateDivider ? DATE_DIVIDER_SPACING_PX : 0;
				const dividerKey = item.contentKey || `divider-${i}`;
				rows.push({
					kind: 'divider',
					key: dividerKey,
					content: item.content as string,
					isUnread,
					isDate: isDateDivider,
					spacing: dividerSpacing,
				});
				lastRenderedGroupKind = null;
				continue;
			}
			if (
				item.type === STREAM_TYPE_MESSAGE_GROUP_BLOCKED ||
				item.type === STREAM_TYPE_MESSAGE_GROUP_SPAMMER
			) {
				const variant = item.type === STREAM_TYPE_MESSAGE_GROUP_SPAMMER ? 'spammer' : 'blocked';
				pushSpacerIfNeeded('regular', item.key ?? `${variant}-${i}`);
				rows.push({
					kind: 'blockedGroup',
					key: item.key ?? `${variant}-${i}`,
					variant,
					messageGroups: item.content as Array<ChannelStreamItem>,
					revealed: item.key === revealedMessageId,
				});
				lastRenderedGroupKind = 'regular';
				continue;
			}
			continue;
		}
		const message = item.content as Message;
		const itemGroupId = item.groupId ?? message.id;
		if (pendingGroupId && pendingGroupId !== itemGroupId) {
			flushPendingGroup();
		}
		if (!pendingGroupId) {
			pendingGroupId = itemGroupId;
		}
		pendingMessages.push(message);
		pendingStreamItems.push(item);
		if (item.flashKey != null) {
			pendingFlashKey = item.flashKey;
		}
	}
	flushPendingGroup();
	return rows;
}

function estimateMessageHeight(message: Message, compact: boolean, fontSize: number): number {
	const scale = fontSize / 16;
	const baseHeight = (compact ? MESSAGE_HEIGHT_COMPACT_PX : MESSAGE_HEIGHT_COZY_PX) * scale;
	let height = baseHeight;
	if (message.attachments.length > 0) {
		height += ATTACHMENT_HEIGHT_ESTIMATE_PX * scale;
	}
	if (message.embeds.length > 0) {
		height += EMBED_HEIGHT_ESTIMATE_PX * scale * message.embeds.length;
	}
	if (message.content && message.content.length > 120) {
		height += baseHeight * Math.min(4, Math.floor(message.content.length / 120));
	}
	return height;
}

export function estimateMessageListRowHeight(
	row: MessageListRow,
	{compact, fontSize, messageGroupSpacing}: EstimateMessageListRowHeightInput,
): number {
	const scale = fontSize / 16;
	const scaledGroupSpacing = messageGroupSpacing * scale;
	switch (row.kind) {
		case 'groupSpacer':
			return row.variant === 'half' ? scaledGroupSpacing * GROUP_SPACER_HALF_RATIO : scaledGroupSpacing;
		case 'divider':
			return row.spacing + (row.isUnread ? UNREAD_DIVIDER_HEIGHT_PX : DIVIDER_HEIGHT_PX) * scale;
		case 'messageGroup': {
			let height = 0;
			for (let i = 0; i < row.messages.length; i++) {
				height += estimateMessageHeight(row.messages[i], compact, fontSize);
			}
			return height;
		}
		case 'blockedGroup': {
			if (row.revealed) {
				let height = BLOCKED_GROUP_HEIGHT_PX * scale;
				for (const group of row.messageGroups) {
					if (group.type === STREAM_TYPE_MESSAGE && group.content) {
						height += estimateMessageHeight(group.content as Message, compact, fontSize);
					}
				}
				return height;
			}
			const groupCount = row.messageGroups.length;
			return BLOCKED_GROUP_HEIGHT_PX * scale + groupCount * BLOCKED_GROUP_MESSAGE_HEIGHT_PX * scale;
		}
	}
}

export function getMessageListRowAnchorMessageId(row: MessageListRow): string | null {
	switch (row.kind) {
		case 'messageGroup':
			return row.messages[0]?.id ?? null;
		case 'blockedGroup':
			for (const group of row.messageGroups) {
				if (group.type === STREAM_TYPE_MESSAGE && group.content) {
					return (group.content as Message).id;
				}
			}
			return null;
		default:
			return null;
	}
}

export function findMessageListRowIndexByMessageId(
	rows: ReadonlyArray<MessageListRow>,
	messageId: string,
): number {
	for (let index = 0; index < rows.length; index++) {
		const row = rows[index];
		if (row.kind === 'messageGroup') {
			if (row.messages.some((message) => message.id === messageId)) {
				return index;
			}
			continue;
		}
		if (row.kind === 'blockedGroup') {
			for (const group of row.messageGroups) {
				if (group.type === STREAM_TYPE_MESSAGE && (group.content as Message).id === messageId) {
					return index;
				}
			}
		}
	}
	return -1;
}

export function collectPinnedMessageListRowIndices(
	rows: ReadonlyArray<MessageListRow>,
	messageIds: ReadonlyArray<string | null | undefined>,
): Array<number> {
	const pinned = new Set<number>();
	for (const messageId of messageIds) {
		if (!messageId) continue;
		const index = findMessageListRowIndexByMessageId(rows, messageId);
		if (index >= 0) {
			pinned.add(index);
		}
	}
	return [...pinned].sort((left, right) => left - right);
}

export interface MessageListRenderWindow {
	startIndex: number;
	endIndex: number;
}

export function buildMessageListRenderWindow(options: {
	scrollTop: number;
	clientHeight: number;
	rowCount: number;
	rowOffsets: ReadonlyArray<number>;
	bufferPx: number;
}): MessageListRenderWindow | null {
	const {scrollTop, clientHeight, rowCount, rowOffsets, bufferPx} = options;
	if (rowCount <= 0 || rowOffsets.length < rowCount + 1) {
		return null;
	}
	const viewportStart = Math.max(0, scrollTop - bufferPx);
	const viewportEnd = scrollTop + clientHeight + bufferPx;
	let startIndex = 0;
	let endIndex = rowCount - 1;
	for (let index = 0; index < rowCount; index++) {
		if (rowOffsets[index + 1]! > viewportStart) {
			startIndex = index;
			break;
		}
	}
	for (let index = rowCount - 1; index >= 0; index--) {
		if (rowOffsets[index]! < viewportEnd) {
			endIndex = index;
			break;
		}
	}
	return {startIndex, endIndex};
}

export function buildMessageListRowOffsets(
	rows: ReadonlyArray<MessageListRow>,
	estimateOptions: EstimateMessageListRowHeightInput,
): Array<number> {
	const offsets = [0];
	for (const row of rows) {
		offsets.push(offsets[offsets.length - 1]! + estimateMessageListRowHeight(row, estimateOptions));
	}
	return offsets;
}

export interface MessageListViewportModel {
	rowCount: number;
	isReady: boolean;
	pinnedRowIndices: Array<number>;
}

export function resolveMessageListViewportModel(input: {
	rows: ReadonlyArray<MessageListRow>;
	isReady: boolean;
	pinnedMessageIds: ReadonlyArray<string | null | undefined>;
}): MessageListViewportModel {
	return {
		rowCount: input.rows.length,
		isReady: input.isReady,
		pinnedRowIndices: collectPinnedMessageListRowIndices(input.rows, input.pinnedMessageIds),
	};
}

export type RenderMessageListRowProps = {
	channel: Channel;
	highlightedMessageId: string | null;
	messageDisplayCompact: boolean;
	messageGroupSpacing: number;
	revealedMessageId: string | null;
	onMessageEdit?: (target: HTMLElement) => void;
	onReveal?: (messageId: string | null) => void;
	messageRowClassName?: string;
	messageActionsClassName?: string;
	renderMessageActions?: (message: Message) => React.ReactNode;
	readonlyPreview?: boolean;
	dateDividerClassName?: string;
	suppressUnreadIndicator?: boolean;
	getMessageHeadingActivate?: (message: Message) => (() => void) | undefined;
	messages?: ChannelMessages;
};
