// SPDX-License-Identifier: AGPL-3.0-or-later

import {HttpResponse, http} from 'msw';

export function createEasypwnedCheckHandler(options?: {secure?: boolean; status?: number}) {
	const secure = options?.secure ?? true;
	const status = options?.status ?? 200;
	return http.post('http://easypwned.test/check', async () => {
		return HttpResponse.json({secure}, {status});
	});
}
