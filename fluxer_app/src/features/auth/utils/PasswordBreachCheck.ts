// SPDX-License-Identifier: AGPL-3.0-or-later

import {Endpoints} from '@app/features/app/constants/Endpoints';
import {http} from '@app/features/platform/transport/RestTransport';

const SHA1_PATTERN = /^[0-9A-F]{40}$/u;

async function sha1HexUppercase(value: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(value));
	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('')
		.toUpperCase();
}

async function checkPasswordBreachViaHibp(password: string): Promise<boolean> {
	const hashed = await sha1HexUppercase(password);
	const hashPrefix = hashed.slice(0, 5);
	const hashSuffix = hashed.slice(5);
	const response = await fetch(`https://api.pwnedpasswords.com/range/${hashPrefix}`, {
		headers: {
			'Add-Padding': 'true',
		},
	});
	if (!response.ok) {
		throw new Error('hibp_unavailable');
	}
	const body = await response.text();
	for (const line of body.split('\n')) {
		const [suffix, count] = line.trim().split(':');
		if (suffix === hashSuffix && Number.parseInt(count, 10) > 0) {
			return true;
		}
	}
	return false;
}

async function checkPasswordBreachViaServer(password: string): Promise<boolean> {
	const hash = await sha1HexUppercase(password);
	if (!SHA1_PATTERN.test(hash)) {
		throw new Error('invalid_hash');
	}
	const response = await http.post<{breached: boolean}>(Endpoints.AUTH_PASSWORD_BREACH_CHECK, {
		body: {hash},
	});
	if (!response.ok) {
		throw new Error('server_unavailable');
	}
	return response.body.breached;
}

export async function checkPasswordBreach(password: string, useServerCheck: boolean): Promise<boolean> {
	if (password.length < 8) {
		return false;
	}
	if (useServerCheck) {
		return checkPasswordBreachViaServer(password);
	}
	return checkPasswordBreachViaHibp(password);
}
