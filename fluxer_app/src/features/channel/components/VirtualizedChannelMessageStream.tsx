// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/channel/components/ChannelMessages.module.css';
import type {Channel} from '@app/features/channel/models/Channel';
import type {Message} from '@app/features/messaging/models/MessagingMessage';
import type {ChannelMessages} from '@app/features/messaging/state/ChannelMessages';
import {type ChannelStreamItem} from '@app/features/messaging/utils/MessageGroupingUtils';
import {
	buildMessageListRows,
	collectPinnedMessageListRowIndices,
	estimateMessageListRowHeight,
	findMessageListRowIndexByMessageId,
	type RenderMessageListRowProps,
} from '@app/features/messaging/utils/MessageListRowUtils';
import {renderMessageListRow} from '@app/features/messaging/utils/MessageListRowRenderer';
import type {ScrollManager} from '@app/features/platform/utils/ScrollManager';
import {defaultRangeExtractor, useVirtualizer, type Range} from '@tanstack/react-virtual';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, forwardRef} from 'react';

const MESSAGE_LIST_OVERSCAN_ROWS = 8;
const MESSAGE_LIST_RANGE_BUFFER_PX = 480;

export interface VirtualizedChannelMessageStreamHandle {
	scrollToMessageId(messageId: string, align?: 'start' | 'center' | 'end'): void;
	findRowIndexForMessageId(messageId: string): number;
}

interface VirtualizedChannelMessageStreamProps {
	channelStream: Array<ChannelStreamItem>;
	messages: ChannelMessages;
	channel: Channel;
	highlightedMessageId: string | null;
	messageDisplayCompact: boolean;
	messageGroupSpacing: number;
	fontSize: number;
	revealedMessageId: string | null;
	scrollMarginTop: number;
	scrollManager: ScrollManager;
	pinnedMessageIds?: Array<string | null | undefined>;
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

function extendVirtualRange(range: Range, pinnedIndices: ReadonlyArray<number>): Array<number> {
	const indices = defaultRangeExtractor(range);
	if (pinnedIndices.length === 0) {
		return indices;
	}
	const merged = new Set(indices);
	for (const index of pinnedIndices) {
		merged.add(index);
	}
	return [...merged].sort((left, right) => left - right);
}

export const VirtualizedChannelMessageStream = observer(
	forwardRef<VirtualizedChannelMessageStreamHandle, VirtualizedChannelMessageStreamProps>(
		function VirtualizedChannelMessageStream(
			{
				channelStream,
				messages,
				channel,
				highlightedMessageId,
				messageDisplayCompact,
				messageGroupSpacing,
				fontSize,
				revealedMessageId,
				scrollMarginTop,
				scrollManager,
				pinnedMessageIds = [],
				onMessageEdit,
				onReveal,
				messageRowClassName,
				messageActionsClassName,
				renderMessageActions,
				readonlyPreview,
				dateDividerClassName,
				suppressUnreadIndicator,
				getMessageHeadingActivate,
			},
			ref,
		) {
			const rows = useMemo(
				() =>
					buildMessageListRows({
						channelStream,
						revealedMessageId,
						messageGroupSpacing,
						suppressUnreadIndicator,
					}),
				[channelStream, revealedMessageId, messageGroupSpacing, suppressUnreadIndicator],
			);
			const estimateOptions = useMemo(
				() => ({
					compact: messageDisplayCompact,
					fontSize,
					messageGroupSpacing,
				}),
				[messageDisplayCompact, fontSize, messageGroupSpacing],
			);
			const pinnedRowIndices = useMemo(
				() => collectPinnedMessageListRowIndices(rows, pinnedMessageIds),
				[rows, pinnedMessageIds],
			);
			const pinnedRowIndicesRef = useRef(pinnedRowIndices);
			pinnedRowIndicesRef.current = pinnedRowIndices;
			const rangeExtractor = useCallback(
				(range: Range) => extendVirtualRange(range, pinnedRowIndicesRef.current),
				[],
			);
			const virtualizer = useVirtualizer({
				count: rows.length,
				getScrollElement: () => scrollManager.ref.current?.getScrollerNode() ?? null,
				estimateSize: (index) => estimateMessageListRowHeight(rows[index]!, estimateOptions),
				overscan: MESSAGE_LIST_OVERSCAN_ROWS,
				scrollMargin: scrollMarginTop,
				rangeExtractor,
				getItemKey: (index) => rows[index]!.key,
			});
			const rowsRef = useRef(rows);
			rowsRef.current = rows;
			const scrollToMessageId = useCallback(
				(messageId: string, align: 'start' | 'center' | 'end' = 'center') => {
					const rowIndex = findMessageListRowIndexByMessageId(rowsRef.current, messageId);
					if (rowIndex < 0) {
						return;
					}
					virtualizer.scrollToIndex(rowIndex, {align});
				},
				[virtualizer],
			);
			useImperativeHandle(
				ref,
				() => ({
					scrollToMessageId,
					findRowIndexForMessageId: (messageId: string) =>
						findMessageListRowIndexByMessageId(rowsRef.current, messageId),
				}),
				[scrollToMessageId],
			);
			const renderProps = useMemo<RenderMessageListRowProps>(
				() => ({
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
				}),
				[
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
				],
			);
			const virtualRows = virtualizer.getVirtualItems();
			const previousRowCountRef = useRef(rows.length);
			useLayoutEffect(() => {
				if (previousRowCountRef.current !== rows.length) {
					previousRowCountRef.current = rows.length;
					virtualizer.measure();
				}
			}, [rows.length, virtualizer]);
			useLayoutEffect(() => {
				virtualizer.measure();
				scrollManager.scrollHandle();
			}, [messages.version, messageDisplayCompact, messageGroupSpacing, fontSize, scrollManager, virtualizer]);
			useEffect(() => {
				const scrollerNode = scrollManager.ref.current?.getScrollerNode();
				if (!scrollerNode) {
					return;
				}
				const resizeObserver = new ResizeObserver(() => {
					virtualizer.measure();
					scrollManager.scrollHandle();
				});
				resizeObserver.observe(scrollerNode);
				return () => resizeObserver.disconnect();
			}, [scrollManager, virtualizer]);
			return (
				<div
					className={styles.virtualMessageList}
					style={{height: `${virtualizer.getTotalSize()}px`}}
					data-flx="channel.messages.virtual-message-list"
				>
					{virtualRows.map((virtualRow) => {
						const row = rows[virtualRow.index];
						if (!row) {
							return null;
						}
						return (
							<div
								key={virtualRow.key}
								ref={virtualizer.measureElement}
								data-index={virtualRow.index}
								className={styles.virtualMessageRow}
								style={{transform: `translateY(${virtualRow.start}px)`}}
								data-flx="channel.messages.virtual-message-row"
							>
								{renderMessageListRow(row, renderProps)}
							</div>
						);
					})}
				</div>
			);
		},
	),
);

export {MESSAGE_LIST_OVERSCAN_ROWS, MESSAGE_LIST_RANGE_BUFFER_PX};
