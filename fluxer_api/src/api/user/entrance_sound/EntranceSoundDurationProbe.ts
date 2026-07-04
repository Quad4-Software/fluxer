// SPDX-License-Identifier: AGPL-3.0-or-later

import type {EntranceSoundExtension} from '@fluxer/constants/src/EntranceSoundConstants';
import {resolveAudioDurationMs} from '../../utils/AudioDurationProbe';

export async function resolveEntranceSoundDurationMs(params: {
	bytes: Buffer;
	extension: EntranceSoundExtension;
	metadataDurationSeconds: number | null;
}): Promise<number | null> {
	return resolveAudioDurationMs(params);
}
