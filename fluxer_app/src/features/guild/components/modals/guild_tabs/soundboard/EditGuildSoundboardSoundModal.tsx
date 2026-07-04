// SPDX-License-Identifier: AGPL-3.0-or-later

import * as Modal from '@app/features/app/components/dialogs/Modal';
import styles from '@app/features/guild/components/modals/guild_tabs/soundboard/EditGuildSoundboardSoundModal.module.css';
import {HttpError} from '@app/features/platform/types/EndpointError';
import {Logger} from '@app/features/platform/utils/AppLogger';
import {Button} from '@app/features/ui/button/Button';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {Input} from '@app/features/ui/components/form/FormInput';
import {Slider} from '@app/features/ui/components/Slider';
import * as SoundboardCommands from '@app/features/voice/commands/SoundboardCommands';
import {
	SOUNDBOARD_SOUND_NAME_MAX_LENGTH,
	SOUNDBOARD_SOUND_NAME_MIN_LENGTH,
} from '@fluxer/constants/src/SoundboardConstants';
import type {GuildSoundboardSoundResponse} from '@fluxer/schema/src/domains/guild/GuildSoundboardSchemas';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import {useState} from 'react';

const EDIT_SOUND_DESCRIPTOR = msg({
	message: 'Edit soundboard sound',
	comment: 'Title of the modal for editing a guild soundboard sound.',
});
const NAME_LABEL_DESCRIPTOR = msg({
	message: 'Name',
	comment: 'Label for the soundboard sound name field.',
});
const EMOJI_LABEL_DESCRIPTOR = msg({
	message: 'Emoji (optional)',
	comment: 'Label for the optional emoji field shown next to the soundboard sound tile.',
});
const VOLUME_LABEL_DESCRIPTOR = msg({
	message: 'Volume',
	comment: 'Label for the volume slider.',
});
const FAILED_TO_UPDATE_SOUND_DESCRIPTOR = msg({
	message: 'Failed to update soundboard sound',
	comment: 'Error message shown when updating a soundboard sound fails.',
});

const logger = new Logger('EditGuildSoundboardSoundModal');

interface EditGuildSoundboardSoundModalProps {
	guildId: string;
	sound: GuildSoundboardSoundResponse;
	onUpdate: () => void;
}

export const EditGuildSoundboardSoundModal = observer(function EditGuildSoundboardSoundModal({
	guildId,
	sound,
	onUpdate,
}: EditGuildSoundboardSoundModalProps) {
	const {i18n} = useLingui();
	const [name, setName] = useState(sound.name);
	const [emojiName, setEmojiName] = useState(sound.emoji_name ?? '');
	const [volumePercent, setVolumePercent] = useState(Math.round(sound.volume * 100));
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const nameTooShort = name.trim().length < SOUNDBOARD_SOUND_NAME_MIN_LENGTH;
	const handleSave = async () => {
		if (nameTooShort) return;
		setSubmitting(true);
		setError(null);
		try {
			await SoundboardCommands.update(guildId, sound.id, {
				name: name.trim(),
				emoji_name: emojiName.trim().length > 0 ? emojiName.trim() : null,
				volume: Math.max(0, Math.min(2, volumePercent / 100)),
			});
			onUpdate();
			ModalCommands.pop();
		} catch (updateError) {
			logger.error('Failed to update soundboard sound:', updateError);
			setError(updateError instanceof HttpError ? updateError.message : i18n._(FAILED_TO_UPDATE_SOUND_DESCRIPTOR));
			setSubmitting(false);
		}
	};
	return (
		<Modal.Root
			size="small"
			centered
			data-flx="guild.guild-tabs.soundboard.edit-guild-soundboard-sound-modal.modal-root"
		>
			<Modal.Header
				title={i18n._(EDIT_SOUND_DESCRIPTOR)}
				data-flx="guild.guild-tabs.soundboard.edit-guild-soundboard-sound-modal.modal-header"
			/>
			<Modal.Content data-flx="guild.guild-tabs.soundboard.edit-guild-soundboard-sound-modal.modal-content">
				<div
					className={styles.content}
					data-flx="guild.guild-tabs.soundboard.edit-guild-soundboard-sound-modal.content"
				>
					<div
						className={styles.fieldsRow}
						data-flx="guild.guild-tabs.soundboard.edit-guild-soundboard-sound-modal.fields-row"
					>
						<Input
							label={i18n._(NAME_LABEL_DESCRIPTOR)}
							value={name}
							maxLength={SOUNDBOARD_SOUND_NAME_MAX_LENGTH}
							onChange={(event) => setName(event.target.value)}
							className={styles.nameInput}
							data-flx="guild.guild-tabs.soundboard.edit-guild-soundboard-sound-modal.name-input"
						/>
						<Input
							label={i18n._(EMOJI_LABEL_DESCRIPTOR)}
							value={emojiName}
							maxLength={16}
							onChange={(event) => setEmojiName(event.target.value)}
							className={styles.emojiInput}
							data-flx="guild.guild-tabs.soundboard.edit-guild-soundboard-sound-modal.emoji-input"
						/>
					</div>
					<div
						className={styles.volumeRow}
						data-flx="guild.guild-tabs.soundboard.edit-guild-soundboard-sound-modal.volume-row"
					>
						<span
							className={styles.volumeLabel}
							data-flx="guild.guild-tabs.soundboard.edit-guild-soundboard-sound-modal.volume-label"
						>
							{i18n._(VOLUME_LABEL_DESCRIPTOR)}
						</span>
						<Slider
							minValue={0}
							maxValue={200}
							value={volumePercent}
							defaultValue={100}
							factoryDefaultValue={100}
							onValueChange={setVolumePercent}
							onValueRender={(value) => `${Math.round(value)}%`}
							data-flx="guild.guild-tabs.soundboard.edit-guild-soundboard-sound-modal.volume-slider"
						/>
						<span
							className={styles.volumeValue}
							data-flx="guild.guild-tabs.soundboard.edit-guild-soundboard-sound-modal.volume-value"
						>
							{Math.round(volumePercent)}%
						</span>
					</div>
					{error ? (
						<p
							className={styles.errorText}
							data-flx="guild.guild-tabs.soundboard.edit-guild-soundboard-sound-modal.error"
						>
							{error}
						</p>
					) : null}
				</div>
			</Modal.Content>
			<Modal.Footer data-flx="guild.guild-tabs.soundboard.edit-guild-soundboard-sound-modal.modal-footer">
				<Button
					variant="secondary"
					onClick={() => ModalCommands.pop()}
					data-flx="guild.guild-tabs.soundboard.edit-guild-soundboard-sound-modal.button.pop"
				>
					<Trans>Cancel</Trans>
				</Button>
				<Button
					onClick={handleSave}
					disabled={nameTooShort || submitting}
					submitting={submitting}
					data-flx="guild.guild-tabs.soundboard.edit-guild-soundboard-sound-modal.button.save"
				>
					<Trans>Save</Trans>
				</Button>
			</Modal.Footer>
		</Modal.Root>
	);
});
