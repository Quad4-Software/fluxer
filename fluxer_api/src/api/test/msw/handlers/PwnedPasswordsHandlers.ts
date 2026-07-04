// SPDX-License-Identifier: AGPL-3.0-or-later

import {HttpResponse, http} from 'msw';

export function createPwnedPasswordsRangeHandler(options?: {
	suffixes?: Array<{suffix: string; count: number}>;
}) {
	return http.get('https://api.pwnedpasswords.com/range/:prefix', () => {
		const suffixes = options?.suffixes ?? [];
		const body = suffixes.map(({suffix, count}) => `${suffix}:${count}`).join('\n');
		return HttpResponse.text(body, {
			status: 200,
			headers: {
				'content-type': 'text/plain; charset=utf-8',
			},
		});
	});
}
