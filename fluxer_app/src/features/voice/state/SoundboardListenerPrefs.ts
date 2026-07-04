// SPDX-License-Identifier: AGPL-3.0-or-later

import {makePersistent} from '@app/features/platform/utils/MobXPersistence';
import {makeAutoObservable} from 'mobx';

class SoundboardListenerPrefs {
	disabled = false;

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
		void this.initPersistence();
	}

	private async initPersistence(): Promise<void> {
		await makePersistent(this, 'SoundboardListenerPrefs', ['disabled']);
	}

	isDisabled(): boolean {
		return this.disabled;
	}

	setDisabled(disabled: boolean): void {
		this.disabled = disabled;
	}

	toggle(): void {
		this.disabled = !this.disabled;
	}
}

export default new SoundboardListenerPrefs();
