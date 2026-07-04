// SPDX-License-Identifier: AGPL-3.0-or-later

import type {WebhookEvent} from 'livekit-server-sdk';
import {describe, expect, it, vi} from 'vitest';
import type {LimitConfigService} from '../../limits/LimitConfigService';
import type {IUserRepository} from '../../user/IUserRepository';
import type {VoiceTopology} from '../../voice/VoiceTopology';
import type {IGatewayService} from '../IGatewayService';
import {ILiveKitService} from '../ILiveKitService';
import type {IVoiceRoomStore} from '../IVoiceRoomStore';
import {LiveKitWebhookService} from '../LiveKitWebhookService';

class FakeLiveKitService extends ILiveKitService {
	disconnectParticipantByIdentity = vi.fn(async () => {});

	async createToken(): Promise<{token: string; endpoint: string}> {
		throw new Error('not implemented');
	}
	async updateParticipant(): Promise<void> {}
	async updateParticipantPermissions(): Promise<void> {}
	async disconnectParticipant(): Promise<void> {}
	async listParticipants(): Promise<never> {
		throw new Error('not implemented');
	}
	async listActiveRooms(): Promise<never> {
		throw new Error('not implemented');
	}
	getDefaultRegionId(): string | null {
		return null;
	}
	getRegionMetadata(): Array<never> {
		return [];
	}
	getServer(): null {
		return null;
	}
}

function createFakeVoiceTopology(server: {
	regionId: string;
	serverId: string;
	apiKey: string;
	apiSecret: string;
}): VoiceTopology {
	return {
		registerSubscriber: () => {},
		getAllRegions: () => [{id: server.regionId} as ReturnType<VoiceTopology['getAllRegions']>[number]],
		getServersForRegion: () => [
			{
				regionId: server.regionId,
				serverId: server.serverId,
				endpoint: 'wss://voice.example.com',
				apiKey: server.apiKey,
				apiSecret: server.apiSecret,
				latitude: null,
				longitude: null,
				isActive: true,
				restrictions: {},
				createdAt: null,
				updatedAt: null,
			} as ReturnType<VoiceTopology['getServersForRegion']>[number],
		],
	} as unknown as VoiceTopology;
}

function createWebhookService(server: {regionId: string; serverId: string; apiKey: string; apiSecret: string}): {
	service: LiveKitWebhookService;
	liveKitService: FakeLiveKitService;
} {
	const liveKitService = new FakeLiveKitService();
	const service = new LiveKitWebhookService(
		{} as IVoiceRoomStore,
		{} as IGatewayService,
		{} as IUserRepository,
		liveKitService,
		createFakeVoiceTopology(server),
		{} as LimitConfigService,
		null,
	);
	return {service, liveKitService};
}

function createParticipantJoinedEvent(params: {
	roomName: string;
	participantIdentity: string;
	metadata?: string;
}): WebhookEvent {
	return {
		event: 'participant_joined',
		room: {name: params.roomName} as WebhookEvent['room'],
		participant: {
			identity: params.participantIdentity,
			metadata: params.metadata,
		} as WebhookEvent['participant'],
	} as WebhookEvent;
}

describe('LiveKitWebhookService unrecognized participants', () => {
	const server = {
		regionId: 'us-east',
		serverId: 'server-1',
		apiKey: 'test-api-key',
		apiSecret: 'test-api-secret',
	};

	it('ejects a participant that joined without any Fluxer-issued metadata', async () => {
		const {service, liveKitService} = createWebhookService(server);
		const event = createParticipantJoinedEvent({
			roomName: 'guild_1_channel_2',
			participantIdentity: 'guest-hacker',
		});
		await service.handleParticipantJoined(event, server.apiKey);
		expect(liveKitService.disconnectParticipantByIdentity).toHaveBeenCalledWith({
			roomName: 'guild_1_channel_2',
			participantIdentity: 'guest-hacker',
			regionId: server.regionId,
			serverId: server.serverId,
		});
	});

	it('ejects a participant whose metadata does not match the expected Fluxer schema', async () => {
		const {service, liveKitService} = createWebhookService(server);
		const event = createParticipantJoinedEvent({
			roomName: 'guild_1_channel_2',
			participantIdentity: 'guest-hacker',
			metadata: JSON.stringify({unexpected: 'shape'}),
		});
		await service.handleParticipantJoined(event, server.apiKey);
		expect(liveKitService.disconnectParticipantByIdentity).toHaveBeenCalledWith({
			roomName: 'guild_1_channel_2',
			participantIdentity: 'guest-hacker',
			regionId: server.regionId,
			serverId: server.serverId,
		});
	});

	it('does not eject a participant with a valid Fluxer-issued metadata payload', async () => {
		const liveKitService = new FakeLiveKitService();
		const gatewayService = {
			confirmVoiceConnection: vi.fn(async () => ({success: true})),
		} as unknown as IGatewayService;
		const fullService = new LiveKitWebhookService(
			{} as IVoiceRoomStore,
			gatewayService,
			{} as IUserRepository,
			liveKitService,
			createFakeVoiceTopology(server),
			{} as LimitConfigService,
			null,
		);
		const metadata = JSON.stringify({
			user_id: '123',
			channel_id: '456',
			connection_id: 'conn-1',
			guild_id: '789',
			token_nonce: 'nonce-1',
			issued_at: `${Math.floor(Date.now() / 1000)}`,
		});
		const event = createParticipantJoinedEvent({
			roomName: 'guild_789_channel_456',
			participantIdentity: 'user_123_conn-1',
			metadata,
		});
		await fullService.handleParticipantJoined(event, server.apiKey);
		expect(liveKitService.disconnectParticipantByIdentity).not.toHaveBeenCalled();
	});
});
