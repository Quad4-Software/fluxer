// SPDX-License-Identifier: AGPL-3.0-or-later

import {BlockedMessageGroups} from '@app/features/channel/components/BlockedMessageGroups';
import {Divider} from '@app/features/channel/components/ChannelDivider';
import styles from '@app/features/channel/components/ChannelMessages.module.css';
import {MessageGroup} from '@app/features/channel/components/MessageGroup';
import type {
	MessageListRow,
	RenderMessageListRowProps,
} from '@app/features/messaging/utils/MessageListRowUtils';
import type React from 'react';

export function renderMessageListRow(row: MessageListRow, props: RenderMessageListRowProps): React.ReactNode {
	const {
		channel,
		highlightedMessageId,
		messageDisplayCompact,
		messageGroupSpacing,
		onMessageEdit,
		onReveal,
		messageRowClassName,
		messageActionsClassName,
		renderMessageActions,
		readonlyPreview,
		dateDividerClassName,
		getMessageHeadingActivate,
	} = props;
	switch (row.kind) {
		case 'groupSpacer': {
			const spacerClass = row.variant === 'half' ? styles.groupSpacerHalf : styles.groupSpacer;
			return (
				<div
					key={row.key}
					className={spacerClass}
					aria-hidden="true"
					data-flx="channel.message-list-row.group-spacer"
				/>
			);
		}
		case 'divider':
			return (
				<Divider
					key={row.key}
					spacing={row.spacing}
					red={row.isUnread}
					isDate={row.isDate}
					id={row.isUnread ? 'new-messages-bar' : undefined}
					className={dateDividerClassName}
					data-flx="channel.message-list-row.divider"
				>
					{row.content}
				</Divider>
			);
		case 'messageGroup': {
			const getUnreadDividerVisibility = (messageId: string, position: 'before' | 'after') => {
				return position === 'before' && row.unreadDividerBeforeMessageId === messageId;
			};
			return (
				<MessageGroup
					key={row.key}
					messages={row.messages}
					channel={channel}
					onEdit={onMessageEdit}
					highlightedMessageId={highlightedMessageId}
					messageDisplayCompact={messageDisplayCompact}
					flashKey={row.flashKey}
					getUnreadDividerVisibility={getUnreadDividerVisibility}
					idPrefix="chat-messages"
					messageRowClassName={messageRowClassName}
					messageActionsClassName={messageActionsClassName}
					renderMessageActions={renderMessageActions}
					readonlyPreview={readonlyPreview}
					getMessageHeadingActivate={getMessageHeadingActivate}
					data-flx="channel.message-list-row.message-group"
				/>
			);
		}
		case 'blockedGroup':
			return (
				<BlockedMessageGroups
					key={row.key}
					revealed={row.revealed}
					messageGroups={row.messageGroups}
					onReveal={onReveal ?? (() => {})}
					compact={messageDisplayCompact}
					channel={channel}
					messageGroupSpacing={messageGroupSpacing}
					variant={row.variant}
					data-flx="channel.message-list-row.blocked-message-groups"
				/>
			);
	}
}
