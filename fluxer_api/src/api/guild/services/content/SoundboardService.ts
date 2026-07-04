// SPDX-License-Identifier: AGPL-3.0-or-later

import crypto from 'node:crypto';
import {AuditLogActionType} from '@fluxer/constants/src/AuditLogActionType';
import type {LimitKey} from '@fluxer/constants/src/LimitConfigMetadata';
import {MAX_GUILD_SOUNDBOARD_SOUNDS} from '@fluxer/constants/src/LimitConstants';
import {
	SOUNDBOARD_SOUND_DEFAULT_VOLUME,
	SOUNDBOARD_SOUND_EXT_TO_MIME,
	SOUNDBOARD_SOUND_MAX_BYTES,
	SOUNDBOARD_SOUND_MAX_DURATION_MS,
	SOUNDBOARD_SOUND_MIN_DURATION_MS,
	type SoundboardSoundExtension,
	soundboardSoundExtensionFromFormat,
	soundboardSoundExtensionFromMime,
} from '@fluxer/constants/src/SoundboardConstants';
import {ValidationErrorCodes} from '@fluxer/constants/src/ValidationErrorCodes';
import {InputValidationError} from '@fluxer/errors/src/domains/core/InputValidationError';
import {MaxGuildSoundboardSoundsStaticError} from '@fluxer/errors/src/domains/guild/MaxGuildSoundboardSoundsStaticError';
import {UnknownGuildSoundboardSoundError} from '@fluxer/errors/src/domains/guild/UnknownGuildSoundboardSoundError';
import {resolveLimit} from '@fluxer/limits/src/LimitResolver';
import type {GuildSoundboardSoundResponse} from '@fluxer/schema/src/domains/guild/GuildSoundboardSchemas';
import {createSoundboardSoundID, type GuildID, type SoundboardSoundID, type UserID} from '../../../BrandedTypes';
import {Config} from '../../../Config';
import type {IGatewayService} from '../../../infrastructure/IGatewayService';
import type {IMediaService} from '../../../infrastructure/IMediaService';
import type {ISnowflakeService} from '../../../infrastructure/ISnowflakeService';
import type {IStorageService} from '../../../infrastructure/IStorageService';
import {Logger} from '../../../Logger';
import type {LimitConfigService} from '../../../limits/LimitConfigService';
import {createLimitMatchContext} from '../../../limits/LimitMatchContextBuilder';
import type {GuildSoundboardSound} from '../../../models/GuildSoundboardSound';
import {resolveAudioDurationMs} from '../../../utils/AudioDurationProbe';
import type {IGuildRepositoryAggregate} from '../../repositories/IGuildRepositoryAggregate';
import type {ContentHelpers} from './ContentHelpers';
import type {ExpressionAssetPurger} from './ExpressionAssetPurger';

const SOUND_PATH_PREFIX = 'soundboard-sounds';

export function soundboardSoundCdnUrl(sound: GuildSoundboardSound): string {
	return `${Config.endpoints.media}/${SOUND_PATH_PREFIX}/${sound.guildId}/${sound.hash}.${sound.extension}`;
}

export function mapGuildSoundboardSoundToResponse(
	sound: GuildSoundboardSound,
	url: string,
): GuildSoundboardSoundResponse {
	return {
		id: sound.id.toString(),
		guild_id: sound.guildId.toString(),
		name: sound.name,
		emoji_name: sound.emojiName,
		extension: sound.extension as SoundboardSoundExtension,
		content_type: sound.contentType,
		duration_ms: sound.durationMs,
		size_bytes: sound.sizeBytes,
		volume: sound.volume,
		url,
		creator_id: sound.creatorId.toString(),
		available: sound.available,
		created_at: sound.createdAt.toISOString(),
	};
}

export class SoundboardService {
	constructor(
		private readonly guildRepository: IGuildRepositoryAggregate,
		private readonly gatewayService: IGatewayService,
		private readonly snowflakeService: ISnowflakeService,
		private readonly storageService: IStorageService,
		private readonly mediaService: IMediaService,
		private readonly contentHelpers: ContentHelpers,
		private readonly assetPurger: ExpressionAssetPurger,
		private readonly limitConfigService: LimitConfigService,
	) {}

	private resolveGuildLimit(key: LimitKey, fallback: number, guildFeatures: Iterable<string> | null): number {
		const ctx = createLimitMatchContext({user: null, guildFeatures});
		const resolved = resolveLimit(this.limitConfigService.getConfigSnapshot(), ctx, key, {
			evaluationContext: 'guild',
		});
		if (!Number.isFinite(resolved) || resolved < 0) {
			return fallback;
		}
		return Math.floor(resolved);
	}

	cdnUrlFor(sound: GuildSoundboardSound): string {
		return soundboardSoundCdnUrl(sound);
	}

	private s3KeyFor(guildId: GuildID, hash: string, extension: SoundboardSoundExtension): string {
		return `${SOUND_PATH_PREFIX}/${guildId}/${hash}.${extension}`;
	}

	async listSounds(params: {userId: UserID; guildId: GuildID}): Promise<Array<GuildSoundboardSoundResponse>> {
		const {userId, guildId} = params;
		await this.contentHelpers.getGuildData({userId, guildId});
		const sounds = await this.guildRepository.listSoundboardSounds(guildId);
		return sounds.map((sound) => mapGuildSoundboardSoundToResponse(sound, this.cdnUrlFor(sound)));
	}

	async createSound(
		params: {
			userId: UserID;
			guildId: GuildID;
			name: string;
			emojiName?: string | null;
			base64Audio: string;
			volume?: number;
		},
		auditLogReason?: string | null,
	): Promise<GuildSoundboardSoundResponse> {
		const {userId, guildId, base64Audio} = params;
		const name = this.normalizeName(params.name);
		const volume = this.normalizeVolume(params.volume);
		const guildData = await this.contentHelpers.getGuildData({userId, guildId});
		await this.contentHelpers.checkCreateExpressionsPermission({userId, guildId});
		const allSounds = await this.guildRepository.listSoundboardSounds(guildId);
		const maxSounds = this.resolveGuildLimit(
			'max_guild_soundboard_sounds',
			MAX_GUILD_SOUNDBOARD_SOUNDS,
			guildData.features,
		);
		if (allSounds.length >= maxSounds) {
			throw new MaxGuildSoundboardSoundsStaticError(maxSounds);
		}
		const trimmed = base64Audio.includes(',') ? (base64Audio.split(',')[1] ?? '') : base64Audio;
		let bytes: Buffer;
		try {
			bytes = Buffer.from(trimmed, 'base64');
		} catch {
			throw InputValidationError.fromCode('sound', ValidationErrorCodes.INVALID_BASE64_FORMAT);
		}
		if (bytes.length === 0) {
			throw InputValidationError.fromCode('sound', ValidationErrorCodes.INVALID_BASE64_FORMAT);
		}
		if (bytes.length > SOUNDBOARD_SOUND_MAX_BYTES) {
			throw InputValidationError.fromCode('sound', ValidationErrorCodes.SOUNDBOARD_SOUND_SIZE_EXCEEDS_LIMIT, {
				max_bytes: SOUNDBOARD_SOUND_MAX_BYTES,
			});
		}
		const metadata = await this.mediaService.getMetadata({
			type: 'base64',
			base64: trimmed,
			version: 2,
			nsfw: 'allow',
		});
		if (!metadata) {
			throw InputValidationError.fromCode('sound', ValidationErrorCodes.SOUNDBOARD_SOUND_INVALID_FORMAT);
		}
		const extension =
			soundboardSoundExtensionFromFormat(metadata.format) ?? soundboardSoundExtensionFromMime(metadata.content_type);
		if (!extension) {
			throw InputValidationError.fromCode('sound', ValidationErrorCodes.SOUNDBOARD_SOUND_INVALID_FORMAT, {
				format: metadata.format ?? metadata.content_type ?? 'unknown',
			});
		}
		const metadataDurationSeconds = typeof metadata.duration === 'number' ? metadata.duration : null;
		const durationMs = await resolveAudioDurationMs({
			bytes,
			extension,
			metadataDurationSeconds,
		});
		if (durationMs == null) {
			throw InputValidationError.fromCode('sound', ValidationErrorCodes.SOUNDBOARD_SOUND_INVALID_FORMAT);
		}
		if (durationMs > SOUNDBOARD_SOUND_MAX_DURATION_MS || durationMs < SOUNDBOARD_SOUND_MIN_DURATION_MS) {
			throw InputValidationError.fromCode('sound', ValidationErrorCodes.SOUNDBOARD_SOUND_DURATION_EXCEEDS_LIMIT, {
				max_ms: SOUNDBOARD_SOUND_MAX_DURATION_MS,
			});
		}
		const hash = crypto.createHash('md5').update(bytes).digest('hex').slice(0, 16);
		const contentType = SOUNDBOARD_SOUND_EXT_TO_MIME[extension];
		const s3Key = this.s3KeyFor(guildId, hash, extension);
		try {
			await this.storageService.uploadObject({
				bucket: Config.s3.buckets.cdn,
				key: s3Key,
				body: new Uint8Array(bytes),
				contentType,
			});
		} catch (error) {
			Logger.error({error, guildId: guildId.toString(), s3Key}, 'Failed to upload soundboard sound to S3');
			throw InputValidationError.fromCode('sound', ValidationErrorCodes.FAILED_TO_UPLOAD_IMAGE);
		}
		const soundId = createSoundboardSoundID(await this.snowflakeService.generate());
		const row = {
			guild_id: guildId,
			sound_id: soundId,
			name,
			emoji_name: params.emojiName ?? null,
			hash,
			extension,
			content_type: contentType,
			duration_ms: durationMs,
			size_bytes: bytes.length,
			volume,
			creator_id: userId,
			available: true,
			created_at: new Date(),
			version: 1,
		};
		let sound: GuildSoundboardSound;
		try {
			sound = await this.guildRepository.upsertSoundboardSound(row);
		} catch (error) {
			Logger.error({error, guildId: guildId.toString(), s3Key}, 'Failed to persist soundboard sound; rolling back S3');
			await this.storageService.deleteObject(Config.s3.buckets.cdn, s3Key).catch(() => {});
			throw error;
		}
		const updatedSounds = [...allSounds, sound];
		await this.dispatchSoundboardSoundsUpdate({guildId, sounds: updatedSounds});
		await this.contentHelpers.recordAuditLog({
			guildId,
			userId,
			action: AuditLogActionType.SOUNDBOARD_SOUND_CREATE,
			targetId: sound.id,
			auditLogReason: auditLogReason ?? null,
			changes: this.contentHelpers.guildAuditLogService.computeChanges(null, this.serializeSoundForAudit(sound)),
		});
		return mapGuildSoundboardSoundToResponse(sound, this.cdnUrlFor(sound));
	}

	async updateSound(
		params: {
			userId: UserID;
			guildId: GuildID;
			soundId: SoundboardSoundID;
			name?: string;
			emojiName?: string | null;
			volume?: number;
		},
		auditLogReason?: string | null,
	): Promise<GuildSoundboardSoundResponse> {
		const {userId, guildId, soundId} = params;
		const allSounds = await this.guildRepository.listSoundboardSounds(guildId);
		const sound = allSounds.find((s) => s.id === soundId);
		if (!sound) throw new UnknownGuildSoundboardSoundError();
		await this.contentHelpers.checkModifyExpressionPermission({userId, guildId, creatorId: sound.creatorId});
		const previousSnapshot = this.serializeSoundForAudit(sound);
		const updatedSound = await this.guildRepository.upsertSoundboardSound({
			...sound.toRow(),
			name: params.name !== undefined ? this.normalizeName(params.name) : sound.name,
			emoji_name: params.emojiName !== undefined ? params.emojiName : sound.emojiName,
			volume: params.volume !== undefined ? this.normalizeVolume(params.volume) : sound.volume,
		});
		const updatedSounds = allSounds.map((s) => (s.id === soundId ? updatedSound : s));
		await this.dispatchSoundboardSoundsUpdate({guildId, sounds: updatedSounds});
		await this.contentHelpers.recordAuditLog({
			guildId,
			userId,
			action: AuditLogActionType.SOUNDBOARD_SOUND_UPDATE,
			targetId: soundId,
			auditLogReason: auditLogReason ?? null,
			changes: this.contentHelpers.guildAuditLogService.computeChanges(
				previousSnapshot,
				this.serializeSoundForAudit(updatedSound),
			),
		});
		return mapGuildSoundboardSoundToResponse(updatedSound, this.cdnUrlFor(updatedSound));
	}

	async deleteSound(
		params: {userId: UserID; guildId: GuildID; soundId: SoundboardSoundID},
		auditLogReason?: string | null,
	): Promise<void> {
		const {userId, guildId, soundId} = params;
		const allSounds = await this.guildRepository.listSoundboardSounds(guildId);
		const sound = allSounds.find((s) => s.id === soundId);
		if (!sound) throw new UnknownGuildSoundboardSoundError();
		await this.contentHelpers.checkModifyExpressionPermission({userId, guildId, creatorId: sound.creatorId});
		const previousSnapshot = this.serializeSoundForAudit(sound);
		await this.guildRepository.deleteSoundboardSound(guildId, soundId);
		const updatedSounds = allSounds.filter((s) => s.id !== soundId);
		await this.dispatchSoundboardSoundsUpdate({guildId, sounds: updatedSounds});
		const s3Key = this.s3KeyFor(guildId, sound.hash, sound.extension as SoundboardSoundExtension);
		await this.storageService.deleteObject(Config.s3.buckets.cdn, s3Key).catch((error) => {
			Logger.error({error, guildId: guildId.toString(), s3Key}, 'Failed to delete soundboard sound from S3');
		});
		void this.assetPurger;
		await this.contentHelpers.recordAuditLog({
			guildId,
			userId,
			action: AuditLogActionType.SOUNDBOARD_SOUND_DELETE,
			targetId: soundId,
			auditLogReason: auditLogReason ?? null,
			changes: this.contentHelpers.guildAuditLogService.computeChanges(previousSnapshot, null),
		});
	}

	private serializeSoundForAudit(sound: GuildSoundboardSound): Record<string, unknown> {
		return {
			name: sound.name,
			emoji_name: sound.emojiName,
			volume: sound.volume,
		};
	}

	private async dispatchSoundboardSoundsUpdate(params: {
		guildId: GuildID;
		sounds: Array<GuildSoundboardSound>;
	}): Promise<void> {
		const {guildId, sounds} = params;
		await this.gatewayService.dispatchGuild({
			guildId,
			event: 'GUILD_SOUNDBOARD_SOUNDS_UPDATE',
			data: {
				sounds: sounds.map((sound) => mapGuildSoundboardSoundToResponse(sound, this.cdnUrlFor(sound))),
			},
		});
	}

	private normalizeName(rawName: string): string {
		const trimmed = rawName.trim();
		if (trimmed.length < 2 || trimmed.length > 32) {
			throw InputValidationError.fromCode('name', ValidationErrorCodes.SOUNDBOARD_SOUND_NAME_LENGTH_INVALID, {
				max: 32,
			});
		}
		return trimmed;
	}

	private normalizeVolume(volume: number | undefined): number {
		if (volume === undefined) return SOUNDBOARD_SOUND_DEFAULT_VOLUME;
		if (!Number.isFinite(volume)) return SOUNDBOARD_SOUND_DEFAULT_VOLUME;
		return Math.min(2, Math.max(0, volume));
	}
}
