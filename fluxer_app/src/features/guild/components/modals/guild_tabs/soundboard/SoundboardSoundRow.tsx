// SPDX-License-Identifier: AGPL-3.0-or-later

import {ConfirmModal} from '@app/features/app/components/dialogs/ConfirmModal';
import {EditGuildSoundboardSoundModal} from '@app/features/guild/components/modals/guild_tabs/soundboard/EditGuildSoundboardSoundModal';
import styles from '@app/features/guild/components/modals/guild_tabs/soundboard/SoundboardSoundRow.module.css';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import FocusRing from '@app/features/ui/focus_ring/FocusRing';
import {Tooltip} from '@app/features/ui/tooltip/Tooltip';
import * as SoundboardCommands from '@app/features/voice/commands/SoundboardCommands';
import SoundboardPlaybackEngine from '@app/features/voice/engine/SoundboardPlaybackEngine';
import type {GuildSoundboardSoundResponse} from '@fluxer/schema/src/domains/guild/GuildSoundboardSchemas';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {PencilIcon, PlayIcon, SpeakerHighIcon, XIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import {useCallback, useState} from 'react';

const PLAY_DESCRIPTOR = msg({
	message: 'Play',
	comment: 'Button label that previews a soundboard sound.',
});
const EDIT_DESCRIPTOR = msg({
	message: 'Edit',
	comment: 'Action label for opening the edit flow for the selected item.',
});
const DELETE_SOUND_DESCRIPTOR = msg({
	message: 'Delete sound',
	comment: 'Destructive action that deletes the selected soundboard sound.',
});
const ARE_YOU_SURE_DESCRIPTOR = msg({
	message: 'Delete "{soundName}"? Can\'t be undone.',
	comment: 'Confirm dialog body before deleting a soundboard sound.',
});
const DELETE_DESCRIPTOR = msg({
	message: 'Delete',
	comment: 'Destructive action label.',
});

interface SoundboardSoundRowProps {
	guildId: string;
	sound: GuildSoundboardSoundResponse;
	canModify: boolean;
	onUpdate: () => void;
}

function formatSeconds(durationMs: number): string {
	return `${(durationMs / 1000).toFixed(1)}s`;
}

export const SoundboardSoundRow = observer(function SoundboardSoundRow({
	guildId,
	sound,
	canModify,
	onUpdate,
}: SoundboardSoundRowProps) {
	const {i18n} = useLingui();
	const [isPlaying, setIsPlaying] = useState(false);
	const handlePlay = useCallback(async () => {
		if (isPlaying) return;
		setIsPlaying(true);
		try {
			const buffer = await SoundboardPlaybackEngine.fetchBuffer(sound.url, sound.id);
			if (buffer) {
				SoundboardPlaybackEngine.playPreview(buffer, sound.volume);
			}
		} finally {
			setTimeout(() => setIsPlaying(false), sound.duration_ms + 50);
		}
	}, [isPlaying, sound]);
	const handleEdit = useCallback(() => {
		ModalCommands.push(
			ModalCommands.modal(() => (
				<EditGuildSoundboardSoundModal
					guildId={guildId}
					sound={sound}
					onUpdate={onUpdate}
					data-flx="guild.guild-tabs.soundboard.soundboard-sound-row.handle-edit.edit-guild-soundboard-sound-modal"
				/>
			)),
		);
	}, [guildId, sound, onUpdate]);
	const handleDelete = useCallback(() => {
		ModalCommands.push(
			ModalCommands.modal(() => (
				<ConfirmModal
					title={i18n._(DELETE_SOUND_DESCRIPTOR)}
					description={i18n._(ARE_YOU_SURE_DESCRIPTOR, {soundName: sound.name})}
					primaryText={i18n._(DELETE_DESCRIPTOR)}
					primaryVariant="danger"
					onPrimary={async () => {
						await SoundboardCommands.remove(guildId, sound.id);
						onUpdate();
					}}
					data-flx="guild.guild-tabs.soundboard.soundboard-sound-row.handle-delete.confirm-modal"
				/>
			)),
		);
	}, [guildId, sound, onUpdate, i18n]);
	return (
		<div className={styles.container} data-flx="guild.guild-tabs.soundboard.soundboard-sound-row.container">
			<Tooltip text={i18n._(PLAY_DESCRIPTOR)} data-flx="guild.guild-tabs.soundboard.soundboard-sound-row.tooltip.play">
				<FocusRing offset={-2} data-flx="guild.guild-tabs.soundboard.soundboard-sound-row.focus-ring.play">
					<button
						type="button"
						className={clsx(styles.playButton, isPlaying && styles.playButtonActive)}
						onClick={handlePlay}
						disabled={!sound.available}
						aria-label={i18n._(PLAY_DESCRIPTOR)}
						data-flx="guild.guild-tabs.soundboard.soundboard-sound-row.button.play"
					>
						{isPlaying ? (
							<SpeakerHighIcon
								className={styles.icon}
								weight="fill"
								data-flx="guild.guild-tabs.soundboard.soundboard-sound-row.speaker-icon"
							/>
						) : (
							<PlayIcon
								className={styles.icon}
								weight="fill"
								data-flx="guild.guild-tabs.soundboard.soundboard-sound-row.play-icon"
							/>
						)}
					</button>
				</FocusRing>
			</Tooltip>
			{sound.emoji_name && (
				<span className={styles.emoji} data-flx="guild.guild-tabs.soundboard.soundboard-sound-row.emoji">
					{sound.emoji_name}
				</span>
			)}
			<div className={styles.info} data-flx="guild.guild-tabs.soundboard.soundboard-sound-row.info">
				<span className={styles.name} data-flx="guild.guild-tabs.soundboard.soundboard-sound-row.name">
					{sound.name}
				</span>
				<span className={styles.duration} data-flx="guild.guild-tabs.soundboard.soundboard-sound-row.duration">
					{formatSeconds(sound.duration_ms)}
				</span>
			</div>
			{canModify && (
				<div className={styles.actions} data-flx="guild.guild-tabs.soundboard.soundboard-sound-row.actions">
					<Tooltip
						text={i18n._(EDIT_DESCRIPTOR)}
						data-flx="guild.guild-tabs.soundboard.soundboard-sound-row.tooltip.edit"
					>
						<FocusRing offset={-2} data-flx="guild.guild-tabs.soundboard.soundboard-sound-row.focus-ring.edit">
							<button
								type="button"
								onClick={handleEdit}
								className={styles.actionButton}
								aria-label={i18n._(EDIT_DESCRIPTOR)}
								data-flx="guild.guild-tabs.soundboard.soundboard-sound-row.action-button.edit"
							>
								<PencilIcon
									className={styles.icon}
									weight="bold"
									data-flx="guild.guild-tabs.soundboard.soundboard-sound-row.pencil-icon"
								/>
							</button>
						</FocusRing>
					</Tooltip>
					<Tooltip
						text={i18n._(DELETE_DESCRIPTOR)}
						data-flx="guild.guild-tabs.soundboard.soundboard-sound-row.tooltip.delete"
					>
						<FocusRing offset={-2} data-flx="guild.guild-tabs.soundboard.soundboard-sound-row.focus-ring.delete">
							<button
								type="button"
								onClick={handleDelete}
								className={clsx(styles.actionButton, styles.deleteButton)}
								aria-label={i18n._(DELETE_DESCRIPTOR)}
								data-flx="guild.guild-tabs.soundboard.soundboard-sound-row.action-button.delete"
							>
								<XIcon
									className={styles.icon}
									weight="bold"
									data-flx="guild.guild-tabs.soundboard.soundboard-sound-row.x-icon"
								/>
							</button>
						</FocusRing>
					</Tooltip>
				</div>
			)}
		</div>
	);
});
