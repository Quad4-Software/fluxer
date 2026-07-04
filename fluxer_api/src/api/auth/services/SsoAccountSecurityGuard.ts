// SPDX-License-Identifier: AGPL-3.0-or-later

import {SsoManagedAccountActionForbiddenError} from '@fluxer/errors/src/domains/auth/SsoManagedAccountActionForbiddenError';
import type {Context} from 'hono';
import type {User} from '../../models/User';
import type {HonoEnv} from '../../types/HonoEnv';

/**
 * When SSO is enforced instance-wide, account credentials are meant to be fully
 * managed by the external identity provider. Blocks the current user from
 * changing their email, password, or MFA methods in that mode.
 */
export async function assertSsoManagedAccountActionAllowed(ctx: Context<HonoEnv>, user: User): Promise<void> {
	if (!user.traits.has('sso')) {
		return;
	}
	const ssoService = ctx.get('ssoService');
	if (await ssoService.isEnforced()) {
		throw new SsoManagedAccountActionForbiddenError();
	}
}
