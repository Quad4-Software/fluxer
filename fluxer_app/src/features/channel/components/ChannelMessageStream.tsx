// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Channel} from '@app/features/channel/models/Channel';
import type {Message} from '@app/features/messaging/models/MessagingMessage';
import type {ChannelMessages} from '@app/features/messaging/state/ChannelMessages';
import {buildMessageListRows} from '@app/features/messaging/utils/MessageListRowUtils';
import {renderMessageListRow} from '@app/features/messaging/utils/MessageListRowRenderer';
import {type ChannelStreamItem} from '@app/features/messaging/utils/MessageGroupingUtils';
import {IS_DEV} from '@app/features/platform/types/Env';
import {Logger} from '@app/features/platform/utils/AppLogger';
import type React from 'react';

const logger = new Logger('ChannelMessageStream');

interface RenderChannelStreamProps {
	channelStream: Array<ChannelStreamItem>;
	messages: ChannelMessages;
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
}

export function renderChannelStream(props: RenderChannelStreamProps): Array<React.ReactNode> {
	const {
		channelStream,
		channel,
		highlightedMessageId,
		messageDisplayCompact,
		messageGroupSpacing,
		revealedMessageId,
		onMessageEdit,
		onReveal,
		messageRowClassName,
		messageActionsClassName,
		renderMessageActions,
		readonlyPreview,
		dateDividerClassName,
		suppressUnreadIndicator,
		getMessageHeadingActivate,
	} = props;
	const rows = buildMessageListRows({
		channelStream,
		revealedMessageId,
		messageGroupSpacing,
		suppressUnreadIndicator,
	});
	if (IS_DEV) {
		const seenKeys = new Map<string, number>();
		for (let index = 0; index < rows.length; index++) {
			const key = rows[index]!.key;
			const existing = seenKeys.get(key);
			if (existing != null) {
				logger.warn('Duplicate channel stream key detected', {
					key,
					existingIndex: existing,
					nextIndex: index,
				});
				continue;
			}
			seenKeys.set(key, index);
		}
	}
	const renderProps = {
		channel,
		highlightedMessageId,
		messageDisplayCompact,
		messageGroupSpacing,
		revealedMessageId,
		onMessageEdit,
		onReveal,
		messageRowClassName,
		messageActionsClassName,
		renderMessageActions,
		readonlyPreview,
		dateDividerClassName,
		suppressUnreadIndicator,
		getMessageHeadingActivate,
	};
	return rows.map((row) => renderMessageListRow(row, renderProps));
}
