// SPDX-License-Identifier: AGPL-3.0-or-later

import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {BadRequestError} from '@fluxer/errors/src/domains/core/BadRequestError';

export class MaxGuildSoundboardSoundsStaticError extends BadRequestError {
	constructor(maxSounds: number) {
		super({
			code: APIErrorCodes.MAX_SOUNDBOARD_SOUNDS,
			messageVariables: {count: maxSounds},
		});
	}
}
