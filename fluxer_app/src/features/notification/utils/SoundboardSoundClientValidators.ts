// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	SOUNDBOARD_SOUND_EXT_TO_MIME,
	SOUNDBOARD_SOUND_EXTENSIONS,
	SOUNDBOARD_SOUND_MAX_BYTES,
	type SoundboardSoundExtension,
} from '@fluxer/constants/src/SoundboardConstants';

export const SOUNDBOARD_SOUND_FILE_EXTENSIONS: ReadonlyArray<string> = SOUNDBOARD_SOUND_EXTENSIONS.map(
	(ext) => `.${ext}`,
);

export const SOUNDBOARD_SOUND_MIME_TYPES: ReadonlyArray<string> = SOUNDBOARD_SOUND_EXTENSIONS.map(
	(ext) => SOUNDBOARD_SOUND_EXT_TO_MIME[ext as SoundboardSoundExtension],
);

export const SOUNDBOARD_SOUND_FILE_PICKER_ACCEPT = [
	...SOUNDBOARD_SOUND_MIME_TYPES,
	...SOUNDBOARD_SOUND_FILE_EXTENSIONS,
].join(',');

export type SoundboardSoundFileValidationFailure = 'too_large' | 'invalid_type';

export type SoundboardSoundFileValidationResult =
	| {valid: true}
	| {valid: false; reason: SoundboardSoundFileValidationFailure};

export function isValidSoundboardSoundFile(file: File): SoundboardSoundFileValidationResult {
	if (file.size > SOUNDBOARD_SOUND_MAX_BYTES) {
		return {valid: false, reason: 'too_large'};
	}
	const lastDot = file.name.lastIndexOf('.');
	const extension = lastDot >= 0 ? file.name.slice(lastDot).toLowerCase() : '';
	const extOk = SOUNDBOARD_SOUND_FILE_EXTENSIONS.includes(extension);
	const mimeOk = SOUNDBOARD_SOUND_MIME_TYPES.some((mime) => file.type === mime);
	if (!extOk && !mimeOk) {
		return {valid: false, reason: 'invalid_type'};
	}
	return {valid: true};
}
