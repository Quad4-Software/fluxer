// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Message} from '@app/features/messaging/models/MessagingMessage';
import {
	buildMessageListRenderWindow,
	buildMessageListRowOffsets,
	buildMessageListRows,
	collectPinnedMessageListRowIndices,
	estimateMessageListRowHeight,
	findMessageListRowIndexByMessageId,
	getMessageListRowAnchorMessageId,
	resolveMessageListViewportModel,
} from '@app/features/messaging/utils/MessageListRowUtils';
import {describe, expect, it} from 'vitest';

const estimateOptions = {
	compact: false,
	fontSize: 16,
	messageGroupSpacing: 16,
};

function createMessage(id: string, overrides: Record<string, unknown> = {}): Message {
	return {
		id,
		type: 0,
		content: `message-${id}`,
		attachments: [],
		embeds: [],
		reactions: [],
		author: {id: 'user-1'},
		...overrides,
	} as unknown as Message;
}

describe('MessageListRowUtils', () => {
	it('builds grouped rows with dividers and spacers from a channel stream', () => {
		const rows = buildMessageListRows({
			channelStream: [
				{type: 'DIVIDER', content: 'Today', contentKey: 'date-today'},
				{
					type: 'MESSAGE',
					content: createMessage('m-1'),
					groupId: 'group-1',
				},
				{
					type: 'MESSAGE',
					content: createMessage('m-2'),
					groupId: 'group-1',
				},
				{
					type: 'MESSAGE',
					content: createMessage('m-3'),
					groupId: 'group-2',
				},
			],
			revealedMessageId: null,
			messageGroupSpacing: 16,
		});
		expect(rows.map((row) => row.kind)).toEqual(['divider', 'messageGroup', 'groupSpacer', 'messageGroup']);
		expect(rows[1]?.kind === 'messageGroup' ? rows[1].messages.map((message) => message.id) : []).toEqual([
			'm-1',
			'm-2',
		]);
	});

	it('estimates taller heights for attachment and embed heavy groups', () => {
		const plainGroup = buildMessageListRows({
			channelStream: [{type: 'MESSAGE', content: createMessage('plain')}],
			revealedMessageId: null,
			messageGroupSpacing: 16,
		})[0]!;
		const richGroup = buildMessageListRows({
			channelStream: [
				{
					type: 'MESSAGE',
					content: createMessage('rich', {
						attachments: [{id: 'a-1'}],
						embeds: [{type: 'rich'}],
						content: 'x'.repeat(400),
					}),
				},
			],
			revealedMessageId: null,
			messageGroupSpacing: 16,
		})[0]!;
		const plainHeight = estimateMessageListRowHeight(plainGroup, estimateOptions);
		const richHeight = estimateMessageListRowHeight(richGroup, estimateOptions);
		expect(richHeight).toBeGreaterThan(plainHeight);
	});

	it('estimates taller cozy group starts than grouped follow-up messages', () => {
		const groupedRow = buildMessageListRows({
			channelStream: [
				{type: 'MESSAGE', content: createMessage('first'), groupId: 'g-1'},
				{type: 'MESSAGE', content: createMessage('second'), groupId: 'g-1'},
			],
			revealedMessageId: null,
			messageGroupSpacing: 16,
		})[0]!;
		const singleStartRow = buildMessageListRows({
			channelStream: [{type: 'MESSAGE', content: createMessage('solo')}],
			revealedMessageId: null,
			messageGroupSpacing: 16,
		})[0]!;
		const groupedHeight = estimateMessageListRowHeight(groupedRow, estimateOptions);
		const soloHeight = estimateMessageListRowHeight(singleStartRow, estimateOptions);
		expect(groupedHeight).toBeGreaterThan(soloHeight);
		expect(soloHeight).toBeGreaterThanOrEqual(52);
	});

	it('estimates extra height for reactions and unread dividers', () => {
		const plainGroup = buildMessageListRows({
			channelStream: [{type: 'MESSAGE', content: createMessage('plain')}],
			revealedMessageId: null,
			messageGroupSpacing: 16,
		})[0]!;
		const reactedGroup = buildMessageListRows({
			channelStream: [
				{
					type: 'MESSAGE',
					content: createMessage('reacted', {
						reactions: [{emoji: {name: 'thumbsup'}, count: 1}],
					}),
				},
			],
			revealedMessageId: null,
			messageGroupSpacing: 16,
		})[0]!;
		const unreadGroup = buildMessageListRows({
			channelStream: [
				{
					type: 'MESSAGE',
					content: createMessage('unread'),
					showUnreadDividerBefore: true,
				},
			],
			revealedMessageId: null,
			messageGroupSpacing: 16,
		})[0]!;
		const plainHeight = estimateMessageListRowHeight(plainGroup, estimateOptions);
		const reactedHeight = estimateMessageListRowHeight(reactedGroup, estimateOptions);
		const unreadHeight = estimateMessageListRowHeight(unreadGroup, estimateOptions);
		expect(reactedHeight).toBeGreaterThan(plainHeight);
		expect(unreadHeight).toBeGreaterThan(plainHeight);
	});

	it('finds row indices and anchor ids for grouped messages', () => {
		const rows = buildMessageListRows({
			channelStream: [
				{type: 'MESSAGE', content: createMessage('alpha'), groupId: 'g-1'},
				{type: 'MESSAGE', content: createMessage('beta'), groupId: 'g-1'},
				{type: 'MESSAGE', content: createMessage('gamma'), groupId: 'g-2'},
			],
			revealedMessageId: null,
			messageGroupSpacing: 16,
		});
		expect(findMessageListRowIndexByMessageId(rows, 'beta')).toBe(0);
		expect(findMessageListRowIndexByMessageId(rows, 'gamma')).toBe(2);
		expect(getMessageListRowAnchorMessageId(rows[0]!)).toBe('alpha');
	});

	it('collects pinned row indices for jump and highlight targets', () => {
		const rows = buildMessageListRows({
			channelStream: [
				{type: 'MESSAGE', content: createMessage('one'), groupId: 'g-1'},
				{type: 'MESSAGE', content: createMessage('two'), groupId: 'g-2'},
				{type: 'MESSAGE', content: createMessage('three'), groupId: 'g-3'},
			],
			revealedMessageId: null,
			messageGroupSpacing: 16,
		});
		expect(collectPinnedMessageListRowIndices(rows, ['two', null, 'missing'])).toEqual([2]);
	});

	it('builds render windows from cumulative row offsets', () => {
		const rows = buildMessageListRows({
			channelStream: Array.from({length: 20}, (_, index) => ({
				type: 'MESSAGE',
				content: createMessage(`m-${index}`),
				groupId: `g-${index}`,
			})),
			revealedMessageId: null,
			messageGroupSpacing: 16,
		});
		const offsets = buildMessageListRowOffsets(rows, estimateOptions);
		const window = buildMessageListRenderWindow({
			scrollTop: 120,
			clientHeight: 80,
			rowCount: rows.length,
			rowOffsets: offsets,
			bufferPx: 20,
		});
		expect(window).not.toBeNull();
		expect(window!.startIndex).toBeGreaterThanOrEqual(0);
		expect(window!.endIndex).toBeGreaterThanOrEqual(window!.startIndex);
		expect(window!.endIndex).toBeLessThan(rows.length);
	});

	it('resolves viewport model metadata for ready lists', () => {
		const rows = buildMessageListRows({
			channelStream: [{type: 'MESSAGE', content: createMessage('target')}],
			revealedMessageId: null,
			messageGroupSpacing: 16,
		});
		const model = resolveMessageListViewportModel({
			rows,
			isReady: true,
			pinnedMessageIds: ['target'],
		});
		expect(model.isReady).toBe(true);
		expect(model.rowCount).toBe(1);
		expect(model.pinnedRowIndices).toEqual([0]);
	});
});
