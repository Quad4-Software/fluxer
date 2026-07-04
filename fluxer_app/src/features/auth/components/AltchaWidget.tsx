// SPDX-License-Identifier: AGPL-3.0-or-later

import 'altcha';
import type {WidgetMethods} from 'altcha/types';
import type {} from 'altcha/types/react';
import {observer} from 'mobx-react-lite';
import {useEffect, useRef} from 'react';

interface AltchaStateChangeEvent extends CustomEvent {
	detail: {
		state: string;
		payload?: string;
	};
}

interface AltchaWidgetProps {
	challengeUrl: string;
	onVerify: (token: string) => void;
	onExpire?: () => void;
	onError?: (error: string) => void;
}

export const AltchaWidget = observer(({challengeUrl, onVerify, onExpire, onError}: AltchaWidgetProps) => {
	const widgetRef = useRef<HTMLElement & WidgetMethods>(null);

	useEffect(() => {
		const widget = widgetRef.current;
		if (!widget) {
			return;
		}

		const handleStateChange = (event: Event) => {
			const detail = (event as AltchaStateChangeEvent).detail;
			if (!detail) {
				return;
			}
			if (detail.state === 'verified' && detail.payload) {
				onVerify(detail.payload);
				return;
			}
			if (detail.state === 'expired') {
				onExpire?.();
				return;
			}
			if (detail.state === 'error') {
				onError?.('ALTCHA verification failed');
			}
		};

		widget.addEventListener('statechange', handleStateChange);
		return () => widget.removeEventListener('statechange', handleStateChange);
	}, [onVerify, onExpire, onError]);

	return <altcha-widget ref={widgetRef} challenge={challengeUrl} data-flx="auth.altcha-widget.altcha-widget" />;
});
