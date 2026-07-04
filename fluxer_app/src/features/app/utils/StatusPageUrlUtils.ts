// SPDX-License-Identifier: AGPL-3.0-or-later

export function resolveStatusPageUrl({
	configuredUrl,
	selfHosted,
	defaultHostedStatusUrl,
}: {
	configuredUrl: string | null | undefined;
	selfHosted: boolean;
	defaultHostedStatusUrl: string;
}): string | null {
	const configured = configuredUrl?.trim();
	if (configured) {
		return configured;
	}
	if (!selfHosted) {
		return defaultHostedStatusUrl;
	}
	return null;
}

export function resolveStatusPageIncidentHistoryUrl({
	configuredHistoryUrl,
	statusPageUrl,
}: {
	configuredHistoryUrl: string | null | undefined;
	statusPageUrl: string | null;
}): string | null {
	const configured = configuredHistoryUrl?.trim();
	if (configured) {
		return configured;
	}
	if (!statusPageUrl) {
		return null;
	}
	return `${statusPageUrl.replace(/\/$/, '')}/history`;
}
