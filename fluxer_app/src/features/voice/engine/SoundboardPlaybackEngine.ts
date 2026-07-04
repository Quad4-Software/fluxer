// SPDX-License-Identifier: AGPL-3.0-or-later

import {Logger} from '@app/features/platform/utils/AppLogger';
import StreamerMode from '@app/features/streamer_mode/state/StreamerMode';
import Sound from '@app/features/ui/state/Sound';
import {getEffectiveAudioState} from '@app/features/voice/engine/VoiceEffectiveAudioState';
import SoundboardListenerPrefs from '@app/features/voice/state/SoundboardListenerPrefs';
import VoiceSettings from '@app/features/voice/state/VoiceSettings';
import {synthesizeDefaultSoundboardSound} from '@app/features/voice/utils/VoiceClipToneSynthesizer';
import type {DefaultSoundboardSound} from '@fluxer/constants/src/DefaultSoundboardSounds';

const logger = new Logger('SoundboardPlaybackEngine');

const BUFFER_CACHE_LIMIT = 32;
const MAX_MASTER_VOLUME_PERCENT = 200;

interface PlayCustomParams {
	soundId: string;
	url: string;
	volume: number;
}

interface PlayDefaultParams {
	soundId: string;
	recipe: DefaultSoundboardSound;
}

class SoundboardPlaybackEngine {
	private audioContext: AudioContext | null = null;
	private bufferCache: Map<string, AudioBuffer> = new Map();
	private lastAppliedSinkId: string | null = null;

	private ensureContext(): AudioContext | null {
		if (typeof window === 'undefined') return null;
		if (this.audioContext && this.audioContext.state !== 'closed') {
			if (this.audioContext.state === 'suspended') {
				void this.audioContext.resume().catch((error) => {
					logger.debug('Soundboard AudioContext resume rejected', {error});
				});
			}
			return this.audioContext;
		}
		const Ctor =
			window.AudioContext || (window as typeof window & {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
		if (!Ctor) return null;
		try {
			this.audioContext = new Ctor({latencyHint: 'interactive'});
			this.lastAppliedSinkId = null;
			return this.audioContext;
		} catch (error) {
			logger.warn('Failed to create AudioContext', {error});
			return null;
		}
	}

	private cacheBuffer(key: string, buffer: AudioBuffer): void {
		this.bufferCache.set(key, buffer);
		while (this.bufferCache.size > BUFFER_CACHE_LIMIT) {
			const firstKey = this.bufferCache.keys().next().value;
			if (!firstKey) break;
			this.bufferCache.delete(firstKey);
		}
	}

	private touchCache(key: string): AudioBuffer | null {
		const cached = this.bufferCache.get(key);
		if (!cached) return null;
		this.bufferCache.delete(key);
		this.bufferCache.set(key, cached);
		return cached;
	}

	private async fetchAndDecode(url: string, key: string): Promise<AudioBuffer | null> {
		const cached = this.touchCache(key);
		if (cached) return cached;
		const ctx = this.ensureContext();
		if (!ctx) return null;
		try {
			const response = await fetch(url, {cache: 'force-cache'});
			if (!response.ok) {
				logger.warn('Soundboard sound fetch failed', {url, status: response.status});
				return null;
			}
			const bytes = await response.arrayBuffer();
			const buffer = await ctx.decodeAudioData(bytes);
			this.cacheBuffer(key, buffer);
			return buffer;
		} catch (error) {
			logger.warn('Soundboard sound decode failed', {url, error});
			return null;
		}
	}

	private async getDefaultBuffer(recipe: DefaultSoundboardSound): Promise<AudioBuffer | null> {
		const key = `default:${recipe.soundId}`;
		const cached = this.touchCache(key);
		if (cached) return cached;
		try {
			const buffer = await synthesizeDefaultSoundboardSound(recipe);
			this.cacheBuffer(key, buffer);
			return buffer;
		} catch (error) {
			logger.warn('Failed to synthesize default soundboard sound', {soundId: recipe.soundId, error});
			return null;
		}
	}

	private getMasterVolumeMultiplier(): number {
		return Math.max(0, Math.min(MAX_MASTER_VOLUME_PERCENT, Sound.getMasterVolume())) / 100;
	}

	private applyOutputDevice(ctx: AudioContext): void {
		const deviceId = VoiceSettings.getOutputDeviceId();
		const sinkId = !deviceId || deviceId === 'default' ? '' : deviceId;
		if (sinkId === this.lastAppliedSinkId) return;
		if (sinkId === '' && this.lastAppliedSinkId === null) return;
		const sinkableContext = ctx as AudioContext & {setSinkId?: (sinkId: string) => Promise<void>};
		if (typeof sinkableContext.setSinkId !== 'function') return;
		const previousSinkId = this.lastAppliedSinkId;
		this.lastAppliedSinkId = sinkId;
		void sinkableContext.setSinkId(sinkId).catch((error) => {
			this.lastAppliedSinkId = previousSinkId;
			logger.debug('Failed to apply output device to soundboard context', {sinkId, error});
		});
	}

	private playBuffer(buffer: AudioBuffer, volume: number): void {
		const ctx = this.ensureContext();
		if (!ctx) return;
		this.applyOutputDevice(ctx);
		const outputVolumePct = VoiceSettings.getOutputVolume();
		const gainValue = Math.max(0, Math.min(3, volume * (outputVolumePct / 100) * this.getMasterVolumeMultiplier()));
		try {
			const source = ctx.createBufferSource();
			source.buffer = buffer;
			const gain = ctx.createGain();
			gain.gain.value = gainValue;
			source.connect(gain).connect(ctx.destination);
			source.start();
		} catch (error) {
			logger.warn('Failed to play soundboard sound', {error});
		}
	}

	private shouldPlay(): boolean {
		if (SoundboardListenerPrefs.isDisabled()) return false;
		if (getEffectiveAudioState().effectiveDeaf) return false;
		if (StreamerMode.shouldDisableSounds) return false;
		if (!Sound.getSoundEnabled()) return false;
		return true;
	}

	async playCustom(params: PlayCustomParams): Promise<void> {
		if (!this.shouldPlay()) return;
		const {soundId, url, volume} = params;
		const buffer = await this.fetchAndDecode(url, `custom:${soundId}:${url}`);
		if (!buffer) return;
		this.playBuffer(buffer, volume);
	}

	async playDefault(params: PlayDefaultParams): Promise<void> {
		if (!this.shouldPlay()) return;
		const buffer = await this.getDefaultBuffer(params.recipe);
		if (!buffer) return;
		this.playBuffer(buffer, 1);
	}

	playPreview(buffer: AudioBuffer, volume = 1): void {
		const ctx = this.ensureContext();
		if (!ctx) return;
		try {
			const source = ctx.createBufferSource();
			source.buffer = buffer;
			const gain = ctx.createGain();
			gain.gain.value = Math.max(0, Math.min(3, volume * (VoiceSettings.getOutputVolume() / 100)));
			source.connect(gain).connect(ctx.destination);
			source.start();
		} catch (error) {
			logger.warn('Failed to play soundboard preview', {error});
		}
	}

	async fetchBuffer(url: string, soundId: string): Promise<AudioBuffer | null> {
		return this.fetchAndDecode(url, `custom:${soundId}:${url}`);
	}

	async previewDefault(recipe: DefaultSoundboardSound): Promise<AudioBuffer | null> {
		return this.getDefaultBuffer(recipe);
	}
}

const instance = new SoundboardPlaybackEngine();

export default instance;
