// SPDX-License-Identifier: AGPL-3.0-or-later

import type {DefaultSoundboardSound, SoundboardToneStep} from '@fluxer/constants/src/DefaultSoundboardSounds';

const SYNTHESIS_SAMPLE_RATE = 44100;
const STEP_RELEASE_MS = 12;

function scheduleStep(ctx: OfflineAudioContext, step: SoundboardToneStep, startSeconds: number): void {
	const durationSeconds = step.durationMs / 1000;
	const releaseSeconds = Math.min(durationSeconds / 2, STEP_RELEASE_MS / 1000);
	const oscillator = ctx.createOscillator();
	oscillator.type = step.waveform;
	oscillator.frequency.value = step.frequencyHz;
	const gain = ctx.createGain();
	gain.gain.setValueAtTime(0, startSeconds);
	gain.gain.linearRampToValueAtTime(step.gain, startSeconds + Math.min(0.01, durationSeconds / 4));
	gain.gain.setValueAtTime(step.gain, Math.max(startSeconds, startSeconds + durationSeconds - releaseSeconds));
	gain.gain.linearRampToValueAtTime(0, startSeconds + durationSeconds);
	oscillator.connect(gain).connect(ctx.destination);
	oscillator.start(startSeconds);
	oscillator.stop(startSeconds + durationSeconds);
}

/**
 * Renders a default soundboard tone recipe into an AudioBuffer using an offline render pass.
 * Every client synthesizes the same deterministic recipe, so no binary asset needs to be fetched
 * or shipped for the bundled default soundboard catalog.
 */
export async function synthesizeDefaultSoundboardSound(sound: DefaultSoundboardSound): Promise<AudioBuffer> {
	const totalDurationSeconds = Math.max(0.05, sound.steps.reduce((sum, step) => sum + step.durationMs, 0) / 1000);
	const frameCount = Math.ceil(totalDurationSeconds * SYNTHESIS_SAMPLE_RATE);
	const OfflineCtor =
		typeof window === 'undefined'
			? null
			: window.OfflineAudioContext ||
				(window as typeof window & {webkitOfflineAudioContext?: typeof OfflineAudioContext}).webkitOfflineAudioContext;
	if (!OfflineCtor) {
		throw new Error('OfflineAudioContext is not supported in this environment');
	}
	const ctx = new OfflineCtor(1, frameCount, SYNTHESIS_SAMPLE_RATE);
	let cursorSeconds = 0;
	for (const step of sound.steps) {
		scheduleStep(ctx, step, cursorSeconds);
		cursorSeconds += step.durationMs / 1000;
	}
	return ctx.startRendering();
}
