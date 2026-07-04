// SPDX-License-Identifier: AGPL-3.0-or-later

import {CappedMap} from 'altcha-lib';

const DEFAULT_MAX_SIZE = 10_000;

let challengeStore: CappedMap<string, boolean> | null = null;

export function getAltchaChallengeStore(maxSize = DEFAULT_MAX_SIZE): CappedMap<string, boolean> {
	if (!challengeStore) {
		challengeStore = new CappedMap<string, boolean>({maxSize});
	}
	return challengeStore;
}

export function resetAltchaChallengeStoreForTesting(): void {
	challengeStore = null;
}
