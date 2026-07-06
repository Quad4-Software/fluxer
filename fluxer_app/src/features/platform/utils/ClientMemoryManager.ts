// SPDX-License-Identifier: AGPL-3.0-or-later

import {trimHighlightCacheToFraction} from '@app/features/code_highlighting/utils/ArboriumHighlighting';
import {trimExpressionImagePreloadCache} from '@app/features/expressions/utils/ExpressionImageCache';
import {trimImageCache} from '@app/features/messaging/utils/ImageCacheUtils';
import {trimMarkdownParseCache} from '@app/features/messaging/utils/markdown/MarkdownParseCache';
import Users from '@app/features/user/state/Users';

const HIDDEN_TAB_TRIM_FRACTION = 0.35;

let installed = false;

function trimCachesOnHidden(): void {
	trimImageCache(HIDDEN_TAB_TRIM_FRACTION);
	trimMarkdownParseCache(HIDDEN_TAB_TRIM_FRACTION);
	trimHighlightCacheToFraction(HIDDEN_TAB_TRIM_FRACTION);
	trimExpressionImagePreloadCache(HIDDEN_TAB_TRIM_FRACTION);
	Users.trimToFraction(HIDDEN_TAB_TRIM_FRACTION);
}

function handleVisibilityChange(): void {
	if (document.hidden) {
		trimCachesOnHidden();
	}
}

export function installClientMemoryManager(): void {
	if (installed || typeof document === 'undefined') {
		return;
	}
	installed = true;
	document.addEventListener('visibilitychange', handleVisibilityChange);
}

export function uninstallClientMemoryManager(): void {
	if (!installed || typeof document === 'undefined') {
		return;
	}
	installed = false;
	document.removeEventListener('visibilitychange', handleVisibilityChange);
}
