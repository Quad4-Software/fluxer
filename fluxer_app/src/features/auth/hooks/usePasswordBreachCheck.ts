// SPDX-License-Identifier: AGPL-3.0-or-later

import RuntimeConfig from '@app/features/app/state/RuntimeConfig';
import {checkPasswordBreach} from '@app/features/auth/utils/PasswordBreachCheck';
import {useEffect, useRef, useState} from 'react';

export type PasswordBreachStatus = 'idle' | 'checking' | 'safe' | 'breached' | 'unavailable';

const DEBOUNCE_MS = 450;
const MIN_PASSWORD_LENGTH = 8;

export function usePasswordBreachCheck(password: string, enabled: boolean): PasswordBreachStatus {
	const [status, setStatus] = useState<PasswordBreachStatus>('idle');
	const requestIdRef = useRef(0);
	useEffect(() => {
		if (!enabled || password.length < MIN_PASSWORD_LENGTH) {
			setStatus('idle');
			return;
		}
		const requestId = ++requestIdRef.current;
		setStatus('checking');
		const timer = window.setTimeout(() => {
			void (async () => {
				try {
					const breached = await checkPasswordBreach(password, RuntimeConfig.features.easypwned_enabled);
					if (requestId !== requestIdRef.current) {
						return;
					}
					setStatus(breached ? 'breached' : 'safe');
				} catch {
					if (requestId !== requestIdRef.current) {
						return;
					}
					setStatus('unavailable');
				}
			})();
		}, DEBOUNCE_MS);
		return () => {
			window.clearTimeout(timer);
		};
	}, [enabled, password]);
	return status;
}
