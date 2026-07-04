// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/app/components/ConnectionIssuesLinks.module.css';
import RuntimeConfig from '@app/features/app/state/RuntimeConfig';
import type {StatusPageIncident} from '@app/features/user/state/StatusPage';
import {Trans} from '@lingui/react/macro';

interface ConnectionIssuesLinksProps {
	incident: StatusPageIncident | null;
	className?: string;
}

export function ConnectionIssuesLinks({incident, className}: ConnectionIssuesLinksProps) {
	const statusPageUrl = RuntimeConfig.statusPageUrl;
	const incidentUrl = incident?.url || RuntimeConfig.statusPageIncidentHistoryUrl;
	if (!statusPageUrl) {
		return null;
	}
	const containerClassName = className != null ? `${styles.container} ${className}` : styles.container;
	return (
		<div className={containerClassName} data-flx="app.connection-issues-links.div">
			<p className={styles.prompt} data-flx="app.connection-issues-links.prompt">
				<Trans>Connection issues?</Trans>
			</p>
			<p className={styles.links} data-flx="app.connection-issues-links.links">
				<a
					href={statusPageUrl}
					target="_blank"
					rel="noopener noreferrer"
					className={styles.link}
					data-flx="app.connection-issues-links.link"
				>
					<Trans>Status page</Trans>
				</a>
				{incidentUrl && (
					<>
						<span aria-hidden="true" className={styles.separator} data-flx="app.connection-issues-links.separator">
							·
						</span>
						<a
							href={incidentUrl}
							target="_blank"
							rel="noopener noreferrer"
							className={styles.link}
							data-flx="app.connection-issues-links.link--2"
						>
							{incident ? <Trans>Read incident</Trans> : <Trans>Incident history</Trans>}
						</a>
					</>
				)}
			</p>
		</div>
	);
}
