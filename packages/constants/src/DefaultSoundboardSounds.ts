// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Bundled default soundboard catalog available to every user with no upload required.
 *
 * Fluxer is self-hosted and cannot bundle third-party licensed audio, so default sounds are
 * described declaratively as short oscillator "recipes" instead of shipping binary audio files.
 * Every client (web, desktop, mobile) renders the same recipe deterministically with the Web
 * Audio API (or an equivalent native synthesizer), so all listeners hear an identical clip
 * without any CDN fetch. See VoiceClipToneSynthesizer on the client for the renderer.
 */

export type SoundboardToneWaveform = 'sine' | 'square' | 'triangle' | 'sawtooth';

export interface SoundboardToneStep {
	/** Frequency in Hz for this step. */
	readonly frequencyHz: number;
	/** Step duration in milliseconds. */
	readonly durationMs: number;
	/** Oscillator waveform for this step. */
	readonly waveform: SoundboardToneWaveform;
	/** Peak linear gain for this step, 0-1. */
	readonly gain: number;
}

export interface DefaultSoundboardSound {
	readonly soundId: string;
	readonly name: string;
	readonly emojiName: string;
	readonly category: 'classic' | 'meme' | 'reaction';
	readonly steps: ReadonlyArray<SoundboardToneStep>;
}

export const DEFAULT_SOUNDBOARD_SOUNDS: ReadonlyArray<DefaultSoundboardSound> = Object.freeze([
	{
		soundId: '1',
		name: 'Airhorn',
		emojiName: '📯',
		category: 'classic',
		steps: [
			{frequencyHz: 220, durationMs: 260, waveform: 'sawtooth', gain: 0.9},
			{frequencyHz: 220, durationMs: 260, waveform: 'sawtooth', gain: 0.9},
			{frequencyHz: 220, durationMs: 520, waveform: 'sawtooth', gain: 0.9},
		],
	},
	{
		soundId: '2',
		name: 'Ba Dum Tss',
		emojiName: '🥁',
		category: 'meme',
		steps: [
			{frequencyHz: 120, durationMs: 90, waveform: 'triangle', gain: 0.8},
			{frequencyHz: 120, durationMs: 90, waveform: 'triangle', gain: 0.8},
			{frequencyHz: 2400, durationMs: 220, waveform: 'square', gain: 0.35},
		],
	},
	{
		soundId: '3',
		name: 'Sad Trombone',
		emojiName: '🎺',
		category: 'meme',
		steps: [
			{frequencyHz: 330, durationMs: 220, waveform: 'triangle', gain: 0.85},
			{frequencyHz: 294, durationMs: 220, waveform: 'triangle', gain: 0.85},
			{frequencyHz: 262, durationMs: 220, waveform: 'triangle', gain: 0.85},
			{frequencyHz: 196, durationMs: 440, waveform: 'triangle', gain: 0.85},
		],
	},
	{
		soundId: '4',
		name: 'Ding',
		emojiName: '🔔',
		category: 'reaction',
		steps: [{frequencyHz: 1568, durationMs: 320, waveform: 'sine', gain: 0.6}],
	},
	{
		soundId: '5',
		name: 'Buzzer',
		emojiName: '⛔',
		category: 'reaction',
		steps: [{frequencyHz: 110, durationMs: 480, waveform: 'square', gain: 0.7}],
	},
	{
		soundId: '6',
		name: 'Level Up',
		emojiName: '⭐',
		category: 'reaction',
		steps: [
			{frequencyHz: 523, durationMs: 110, waveform: 'square', gain: 0.5},
			{frequencyHz: 659, durationMs: 110, waveform: 'square', gain: 0.5},
			{frequencyHz: 784, durationMs: 110, waveform: 'square', gain: 0.5},
			{frequencyHz: 1047, durationMs: 220, waveform: 'square', gain: 0.5},
		],
	},
	{
		soundId: '7',
		name: 'Applause',
		emojiName: '👏',
		category: 'reaction',
		steps: [
			{frequencyHz: 180, durationMs: 60, waveform: 'sawtooth', gain: 0.4},
			{frequencyHz: 220, durationMs: 60, waveform: 'sawtooth', gain: 0.5},
			{frequencyHz: 260, durationMs: 60, waveform: 'sawtooth', gain: 0.6},
			{frequencyHz: 200, durationMs: 60, waveform: 'sawtooth', gain: 0.5},
			{frequencyHz: 240, durationMs: 60, waveform: 'sawtooth', gain: 0.5},
		],
	},
	{
		soundId: '8',
		name: 'Oh No',
		emojiName: '😬',
		category: 'reaction',
		steps: [
			{frequencyHz: 392, durationMs: 180, waveform: 'triangle', gain: 0.7},
			{frequencyHz: 349, durationMs: 180, waveform: 'triangle', gain: 0.7},
			{frequencyHz: 293, durationMs: 360, waveform: 'triangle', gain: 0.7},
		],
	},
]);

export function findDefaultSoundboardSound(soundId: string): DefaultSoundboardSound | null {
	return DEFAULT_SOUNDBOARD_SOUNDS.find((sound) => sound.soundId === soundId) ?? null;
}
