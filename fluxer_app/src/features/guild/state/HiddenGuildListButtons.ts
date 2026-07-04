// SPDX-License-Identifier: AGPL-3.0-or-later

import {makeSyncedField} from '@app/features/user/state/SyncedField';
import {HiddenGuildListButtonsSchema} from '@fluxer/schema/src/gen/fluxer/user/preferences/v1/preferences_pb';
import {makeAutoObservable} from 'mobx';

class HiddenGuildListButtons {
	downloadButtonHidden = false;

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
		this.initPersistence();
	}

	private async initPersistence(): Promise<void> {
		await makeSyncedField(this, {
			field: 'hiddenGuildButtons',
			schema: HiddenGuildListButtonsSchema,
			persist: ['downloadButtonHidden'],
			toMessage: (s) => ({
				downloadButton: s.downloadButtonHidden,
			}),
			applyMessage: (s, m) => {
				s.downloadButtonHidden = m.downloadButton;
			},
		});
	}

	hideDownloadButton(): void {
		this.downloadButtonHidden = true;
	}

	showDownloadButton(): void {
		this.downloadButtonHidden = false;
	}
}

export default new HiddenGuildListButtons();
