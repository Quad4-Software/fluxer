// SPDX-License-Identifier: AGPL-3.0-or-later

import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {ForbiddenError} from '@fluxer/errors/src/domains/core/ForbiddenError';

export class SsoManagedAccountActionForbiddenError extends ForbiddenError {
	constructor() {
		super({
			code: APIErrorCodes.SSO_MANAGED_ACCOUNT_ACTION_FORBIDDEN,
			message: 'This account is managed by single sign-on. Contact your identity provider to change this setting.',
		});
		this.name = 'SsoManagedAccountActionForbiddenError';
	}
}
