// SPDX-License-Identifier: AGPL-3.0-or-later

import {GenericErrorModal} from '@app/features/app/components/alerts/GenericErrorModal';
import {StatusSlate} from '@app/features/app/components/dialogs/shared/StatusSlate';
import styles from '@app/features/guild/components/modals/guild_tabs/GuildSoundboardTab.module.css';
import {SoundboardSoundRow} from '@app/features/guild/components/modals/guild_tabs/soundboard/SoundboardSoundRow';
import {UploadDropZone} from '@app/features/guild/components/UploadDropZone';
import {UploadSlotInfo} from '@app/features/guild/components/UploadSlotInfo';
import Guilds from '@app/features/guild/state/Guilds';
import {TRY_AGAIN_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import {openFilePicker} from '@app/features/messaging/utils/FilePickerUtils';
import {formatFileSize} from '@app/features/messaging/utils/FileUtils';
import {
	isValidSoundboardSoundFile,
	SOUNDBOARD_SOUND_FILE_PICKER_ACCEPT,
} from '@app/features/notification/utils/SoundboardSoundClientValidators';
import Permission from '@app/features/permissions/state/Permission';
import {HttpError} from '@app/features/platform/types/EndpointError';
import {Logger} from '@app/features/platform/utils/AppLogger';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {Input} from '@app/features/ui/components/form/FormInput';
import {Spinner} from '@app/features/ui/components/Spinner';
import Users from '@app/features/user/state/Users';
import * as SoundboardCommands from '@app/features/voice/commands/SoundboardCommands';
import {openSoundboardSoundTrimmerModal} from '@app/features/voice/components/SoundboardSoundTrimmerModal';
import {Permissions} from '@fluxer/constants/src/ChannelConstants';
import {MAX_GUILD_SOUNDBOARD_SOUNDS} from '@fluxer/constants/src/LimitConstants';
import {SOUNDBOARD_SOUND_MAX_BYTES} from '@fluxer/constants/src/SoundboardConstants';
import type {GuildSoundboardSoundResponse} from '@fluxer/schema/src/domains/guild/GuildSoundboardSchemas';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {MagnifyingGlassIcon, WarningCircleIcon} from '@phosphor-icons/react';
import {matchSorter} from 'match-sorter';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useEffect, useMemo, useState} from 'react';

const SEARCH_SOUNDS_DESCRIPTOR = msg({
	message: 'Search sounds',
	comment: 'Search input placeholder in the guild soundboard settings tab.',
});
const NO_SOUNDS_FOUND_DESCRIPTOR = msg({
	message: 'No sounds found',
	comment: 'Empty-state title in the guild soundboard tab.',
});
const NO_SOUND_SLOTS_AVAILABLE_DESCRIPTOR = msg({
	message: 'No soundboard slots available',
	comment: 'Empty-state title shown when the soundboard limit is reached.',
});
const SOUND_SLOTS_FULL_DESCRIPTION_DESCRIPTOR = msg({
	message: "You've reached the maximum number of soundboard sounds. Delete one to make room.",
	comment: 'Soundboard upload limit message in community soundboard settings.',
});
const NO_SOUNDS_FOUND_MATCHING_YOUR_SEARCH_DESCRIPTOR = msg({
	message: 'No sounds found matching your search.',
	comment: 'Empty-state text in the guild soundboard tab.',
});
const FAILED_TO_LOAD_SOUNDS_DESCRIPTOR = msg({
	message: 'Failed to load soundboard sounds',
	comment: 'Error message in the guild soundboard tab.',
});
const THERE_WAS_AN_ERROR_LOADING_THE_SOUNDS_DESCRIPTOR = msg({
	message: 'There was an error loading the soundboard sounds. Try again.',
	comment: 'Error message in the guild soundboard tab.',
});
const SOUND_UPLOAD_REQUIREMENTS_DESCRIPTOR = msg({
	message: 'Sounds must be under {maxSize} and 5.2 seconds. Files longer than that get trimmed before upload.',
	comment: 'Description in the community soundboard upload section. {maxSize} is the formatted size limit.',
});
const UNSUPPORTED_SOUND_FILE_TITLE_DESCRIPTOR = msg({
	message: 'Unsupported audio file',
	comment: 'Title of the error modal shown when an unsupported audio file is selected.',
});
const UNSUPPORTED_SOUND_FILE_DESCRIPTOR = msg({
	message: 'This file type is not supported. Try an MP3, OGG, M4A, or WAV file.',
	comment: 'Description of the error modal shown when an unsupported audio file is selected.',
});
const FAILED_TO_UPLOAD_SOUND_DESCRIPTOR = msg({
	message: 'Failed to upload soundboard sound',
	comment: 'Error message shown when uploading a soundboard sound fails.',
});
const logger = new Logger('GuildSoundboardTab');

const GuildSoundboardTab: React.FC<{guildId: string}> = observer(function GuildSoundboardTab({guildId}) {
	const {i18n} = useLingui();
	const [sounds, setSounds] = useState<ReadonlyArray<GuildSoundboardSoundResponse>>([]);
	const [fetchStatus, setFetchStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
	const [searchQuery, setSearchQuery] = useState('');
	const guild = Guilds.getGuild(guildId);
	const canCreateExpressions = Permission.can(Permissions.CREATE_EXPRESSIONS, {guildId});
	const canManageExpressions = Permission.can(Permissions.MANAGE_EXPRESSIONS, {guildId});
	const currentUserId = Users.currentUserId;
	const fetchSounds = useCallback(async () => {
		try {
			setFetchStatus('pending');
			const soundList = await SoundboardCommands.list(guildId);
			setSounds(soundList);
			setFetchStatus('success');
		} catch (error) {
			logger.error('Failed to fetch soundboard sounds', error);
			setFetchStatus('error');
		}
	}, [guildId]);
	useEffect(() => {
		if (fetchStatus === 'idle') {
			void fetchSounds();
		}
	}, [fetchStatus, fetchSounds]);
	const maxSounds = guild?.maxSoundboardSounds ?? MAX_GUILD_SOUNDBOARD_SOUNDS;
	const currentSoundCount = sounds.length;
	const showNoSoundSlotsModal = useCallback(() => {
		ModalCommands.push(
			ModalCommands.modal(() => (
				<GenericErrorModal
					title={i18n._(NO_SOUND_SLOTS_AVAILABLE_DESCRIPTOR)}
					message={i18n._(SOUND_SLOTS_FULL_DESCRIPTION_DESCRIPTOR)}
					data-flx="guild.guild-tabs.guild-soundboard-tab.no-sound-slots-modal"
				/>
			)),
		);
	}, [i18n]);
	const showUnsupportedSoundModal = useCallback(() => {
		ModalCommands.push(
			ModalCommands.modal(() => (
				<GenericErrorModal
					title={i18n._(UNSUPPORTED_SOUND_FILE_TITLE_DESCRIPTOR)}
					message={i18n._(UNSUPPORTED_SOUND_FILE_DESCRIPTOR)}
					data-flx="guild.guild-tabs.guild-soundboard-tab.unsupported-sound-modal"
				/>
			)),
		);
	}, [i18n]);
	const handleFile = useCallback(
		(file: File) => {
			const validation = isValidSoundboardSoundFile(file);
			if (!validation.valid) {
				showUnsupportedSoundModal();
				return;
			}
			const proposedName = file.name.replace(/\.[^./]+$/, '').slice(0, 32) || 'Sound';
			openSoundboardSoundTrimmerModal({
				sourceFile: file,
				defaultName: proposedName,
				onConfirm: async (trimmed) => {
					try {
						const buffer = await trimmed.blob.arrayBuffer();
						const bytes = new Uint8Array(buffer);
						let binary = '';
						const chunkSize = 0x8000;
						for (let i = 0; i < bytes.length; i += chunkSize) {
							const chunk = bytes.subarray(i, i + chunkSize);
							binary += String.fromCharCode(...chunk);
						}
						const base64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
						await SoundboardCommands.create(guildId, {
							name: trimmed.name,
							emoji_name: trimmed.emojiName,
							sound: base64,
							volume: trimmed.volume,
						});
						await fetchSounds();
					} catch (error) {
						logger.error('Failed to upload soundboard sound', error);
						throw error instanceof HttpError ? error : new Error(i18n._(FAILED_TO_UPLOAD_SOUND_DESCRIPTOR));
					}
				},
			});
		},
		[guildId, fetchSounds, i18n, showUnsupportedSoundModal],
	);
	const handleAddSound = useCallback(async () => {
		if (currentSoundCount >= maxSounds) {
			showNoSoundSlotsModal();
			return;
		}
		const [file] = await openFilePicker({accept: SOUNDBOARD_SOUND_FILE_PICKER_ACCEPT});
		if (file) handleFile(file);
	}, [currentSoundCount, maxSounds, showNoSoundSlotsModal, handleFile]);
	const handleDrop = useCallback(
		(files: Array<File>) => {
			if (currentSoundCount >= maxSounds) {
				showNoSoundSlotsModal();
				return;
			}
			const file = files[0];
			if (file) handleFile(file);
		},
		[currentSoundCount, maxSounds, showNoSoundSlotsModal, handleFile],
	);
	const filteredSounds = useMemo(() => {
		if (!searchQuery) return sounds;
		return matchSorter(sounds, searchQuery, {keys: [(sound) => sound.name]});
	}, [sounds, searchQuery]);
	const canModifySound = useCallback(
		(sound: GuildSoundboardSoundResponse): boolean => {
			if (canManageExpressions) return true;
			if (canCreateExpressions && sound.creator_id === currentUserId) return true;
			return false;
		},
		[canManageExpressions, canCreateExpressions, currentUserId],
	);
	const soundMaxSizeLabel = formatFileSize(SOUNDBOARD_SOUND_MAX_BYTES);
	return (
		<div className={styles.container} data-flx="guild.guild-tabs.guild-soundboard-tab.container">
			<div className={styles.controls} data-flx="guild.guild-tabs.guild-soundboard-tab.controls">
				<Input
					type="text"
					placeholder={i18n._(SEARCH_SOUNDS_DESCRIPTOR)}
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
					leftIcon={
						<MagnifyingGlassIcon
							size={16}
							weight="bold"
							data-flx="guild.guild-tabs.guild-soundboard-tab.magnifying-glass-icon"
						/>
					}
					className={styles.searchInput}
					data-flx="guild.guild-tabs.guild-soundboard-tab.search-input"
				/>
			</div>
			{canCreateExpressions && (
				<>
					<UploadSlotInfo
						title={<Trans>Soundboard slots</Trans>}
						currentCount={currentSoundCount}
						maxCount={maxSounds}
						uploadButtonText={<Trans>Upload sound</Trans>}
						onUploadClick={handleAddSound}
						description={i18n._(SOUND_UPLOAD_REQUIREMENTS_DESCRIPTOR, {maxSize: soundMaxSizeLabel})}
						data-flx="guild.guild-tabs.guild-soundboard-tab.upload-slot-info"
					/>
					<UploadDropZone
						onDrop={handleDrop}
						description={<Trans>Drag and drop an audio file here (one at a time)</Trans>}
						acceptMultiple={false}
						data-flx="guild.guild-tabs.guild-soundboard-tab.upload-drop-zone"
					/>
				</>
			)}
			{fetchStatus === 'pending' && (
				<div className={styles.spinnerContainer} data-flx="guild.guild-tabs.guild-soundboard-tab.spinner-container">
					<Spinner data-flx="guild.guild-tabs.guild-soundboard-tab.spinner" />
				</div>
			)}
			{searchQuery && filteredSounds.length === 0 && (
				<StatusSlate
					Icon={MagnifyingGlassIcon}
					title={i18n._(NO_SOUNDS_FOUND_DESCRIPTOR)}
					description={i18n._(NO_SOUNDS_FOUND_MATCHING_YOUR_SEARCH_DESCRIPTOR)}
					fullHeight={true}
					data-flx="guild.guild-tabs.guild-soundboard-tab.status-slate"
				/>
			)}
			{fetchStatus === 'success' && filteredSounds.length > 0 && (
				<div className={styles.soundList} data-flx="guild.guild-tabs.guild-soundboard-tab.sound-list">
					{filteredSounds.map((sound) => (
						<SoundboardSoundRow
							key={sound.id}
							guildId={guildId}
							sound={sound}
							canModify={canModifySound(sound)}
							onUpdate={fetchSounds}
							data-flx="guild.guild-tabs.guild-soundboard-tab.soundboard-sound-row"
						/>
					))}
				</div>
			)}
			{fetchStatus === 'error' && (
				<StatusSlate
					Icon={WarningCircleIcon}
					title={i18n._(FAILED_TO_LOAD_SOUNDS_DESCRIPTOR)}
					description={i18n._(THERE_WAS_AN_ERROR_LOADING_THE_SOUNDS_DESCRIPTOR)}
					actions={[{text: i18n._(TRY_AGAIN_DESCRIPTOR), onClick: fetchSounds, variant: 'primary'}]}
					fullHeight={true}
					data-flx="guild.guild-tabs.guild-soundboard-tab.status-slate--2"
				/>
			)}
		</div>
	);
});

export default GuildSoundboardTab;
