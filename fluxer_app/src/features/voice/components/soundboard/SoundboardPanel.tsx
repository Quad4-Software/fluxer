// SPDX-License-Identifier: AGPL-3.0-or-later

import Guilds from '@app/features/guild/state/Guilds';
import Permission from '@app/features/permissions/state/Permission';
import {Logger} from '@app/features/platform/utils/AppLogger';
import {Input} from '@app/features/ui/components/form/FormInput';
import {Scroller} from '@app/features/ui/components/Scroller';
import {Tooltip} from '@app/features/ui/tooltip/Tooltip';
import * as SoundboardCommands from '@app/features/voice/commands/SoundboardCommands';
import styles from '@app/features/voice/components/soundboard/SoundboardPanel.module.css';
import MediaEngine from '@app/features/voice/engine/MediaEngineFacade';
import SoundboardPlaybackEngine from '@app/features/voice/engine/SoundboardPlaybackEngine';
import type {SoundboardSound} from '@app/features/voice/models/SoundboardSound';
import Soundboard from '@app/features/voice/state/Soundboard';
import SoundboardListenerPrefs from '@app/features/voice/state/SoundboardListenerPrefs';
import {Permissions} from '@fluxer/constants/src/ChannelConstants';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {GearIcon, MagnifyingGlassIcon, MusicNotesIcon, SpeakerHighIcon, SpeakerSlashIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {matchSorter} from 'match-sorter';
import {observer} from 'mobx-react-lite';
import {useCallback, useMemo, useState} from 'react';

const SOUNDBOARD_DESCRIPTOR = msg({
	message: 'Soundboard',
	comment: 'Title of the in-call soundboard panel.',
});
const SEARCH_SOUNDS_DESCRIPTOR = msg({
	message: 'Search sounds',
	comment: 'Search input placeholder in the in-call soundboard panel.',
});
const MUTE_SOUNDBOARD_DESCRIPTOR = msg({
	message: 'Mute soundboard sounds for me',
	comment: 'Tooltip on the mute-all toggle in the in-call soundboard panel.',
});
const UNMUTE_SOUNDBOARD_DESCRIPTOR = msg({
	message: 'Unmute soundboard sounds for me',
	comment: 'Tooltip on the mute-all toggle in the in-call soundboard panel when currently muted.',
});
const SERVER_SOUNDS_DESCRIPTOR = msg({
	message: '{guildName} sounds',
	comment: 'Section heading in the in-call soundboard panel for a server-uploaded sound catalog.',
});
const NO_SOUNDS_FOUND_DESCRIPTOR = msg({
	message: 'No sounds found',
	comment: 'Empty-state text in the in-call soundboard panel.',
});
const NO_PERMISSION_DESCRIPTOR = msg({
	message: "You don't have permission to use the soundboard here",
	comment: 'Empty-state text in the in-call soundboard panel when the user lacks the Use Soundboard permission.',
});
const OPEN_SOUNDBOARD_SETTINGS_DESCRIPTOR = msg({
	message: 'Manage server sounds',
	comment: 'Tooltip on the settings shortcut in the in-call soundboard panel.',
});

const logger = new Logger('SoundboardPanel');

export const SoundboardPanel = observer(function SoundboardPanel() {
	const {i18n} = useLingui();
	const [searchQuery, setSearchQuery] = useState('');
	const [playingSoundId, setPlayingSoundId] = useState<string | null>(null);
	const channelId = MediaEngine.channelId;
	const guildId = MediaEngine.guildId;
	const guild = guildId ? Guilds.getGuild(guildId) : null;
	const guildSounds = guildId ? Soundboard.getGuildSounds(guildId) : [];
	const canUseSoundboard = Boolean(
		channelId &&
			guildId &&
			Permission.can(Permissions.USE_SOUNDBOARD, {channelId}) &&
			Permission.can(Permissions.SPEAK, {channelId}),
	);
	const isMuted = SoundboardListenerPrefs.isDisabled();
	const filteredGuildSounds = useMemo(() => {
		if (!searchQuery) return guildSounds;
		return matchSorter(guildSounds, searchQuery, {keys: [(sound) => sound.name]});
	}, [guildSounds, searchQuery]);
	const hasAnyResults = filteredGuildSounds.length > 0;
	const handlePlay = useCallback(
		(sound: SoundboardSound) => {
			if (!canUseSoundboard || !channelId) return;
			setPlayingSoundId(sound.id);
			if (sound.url) {
				void SoundboardPlaybackEngine.playCustom({soundId: sound.id, url: sound.url, volume: sound.volume});
			}
			void SoundboardCommands.play(channelId, sound.id, sound.guildId).catch((error) => {
				logger.error('Failed to notify participants of soundboard sound play', error);
			});
			window.setTimeout(
				() => setPlayingSoundId((current) => (current === sound.id ? null : current)),
				sound.durationMs + 80,
			);
		},
		[canUseSoundboard, channelId],
	);
	const handleToggleMute = useCallback(() => {
		SoundboardListenerPrefs.toggle();
	}, []);
	const renderTile = useCallback(
		(sound: SoundboardSound) => (
			<Tooltip key={sound.id} text={sound.name} data-flx="voice.soundboard.soundboard-panel.render-tile.tooltip">
				<button
					type="button"
					className={clsx(styles.tile, playingSoundId === sound.id && styles.tileActive)}
					onClick={() => handlePlay(sound)}
					disabled={!canUseSoundboard || !sound.available}
					data-flx="voice.soundboard.soundboard-panel.render-tile.button"
				>
					<span className={styles.tileEmoji} data-flx="voice.soundboard.soundboard-panel.render-tile.emoji">
						{sound.emojiName ?? '🔊'}
					</span>
					<span className={styles.tileName} data-flx="voice.soundboard.soundboard-panel.render-tile.name">
						{sound.name}
					</span>
				</button>
			</Tooltip>
		),
		[canUseSoundboard, handlePlay, playingSoundId],
	);
	return (
		<div className={styles.container} data-flx="voice.soundboard.soundboard-panel.container">
			<div className={styles.header} data-flx="voice.soundboard.soundboard-panel.header">
				<MusicNotesIcon
					weight="fill"
					className={styles.headerIcon}
					data-flx="voice.soundboard.soundboard-panel.header-icon"
				/>
				<h1 className={styles.title} data-flx="voice.soundboard.soundboard-panel.title">
					{i18n._(SOUNDBOARD_DESCRIPTOR)}
				</h1>
				{guildId && (
					<Tooltip
						text={i18n._(OPEN_SOUNDBOARD_SETTINGS_DESCRIPTOR)}
						data-flx="voice.soundboard.soundboard-panel.tooltip.settings"
					>
						<a
							href={`/guilds/${guildId}/settings/soundboard`}
							className={styles.headerButton}
							data-flx="voice.soundboard.soundboard-panel.header-button.settings"
						>
							<GearIcon
								weight="bold"
								className={styles.headerButtonIcon}
								data-flx="voice.soundboard.soundboard-panel.gear-icon"
							/>
						</a>
					</Tooltip>
				)}
				<Tooltip
					text={isMuted ? i18n._(UNMUTE_SOUNDBOARD_DESCRIPTOR) : i18n._(MUTE_SOUNDBOARD_DESCRIPTOR)}
					data-flx="voice.soundboard.soundboard-panel.tooltip.mute"
				>
					<button
						type="button"
						className={clsx(styles.headerButton, isMuted && styles.headerButtonActive)}
						onClick={handleToggleMute}
						aria-pressed={isMuted}
						data-flx="voice.soundboard.soundboard-panel.header-button.toggle-mute"
					>
						{isMuted ? (
							<SpeakerSlashIcon
								weight="fill"
								className={styles.headerButtonIcon}
								data-flx="voice.soundboard.soundboard-panel.speaker-slash-icon"
							/>
						) : (
							<SpeakerHighIcon
								weight="fill"
								className={styles.headerButtonIcon}
								data-flx="voice.soundboard.soundboard-panel.speaker-high-icon"
							/>
						)}
					</button>
				</Tooltip>
			</div>
			<div className={styles.searchRow} data-flx="voice.soundboard.soundboard-panel.search-row">
				<Input
					type="text"
					placeholder={i18n._(SEARCH_SOUNDS_DESCRIPTOR)}
					value={searchQuery}
					onChange={(event) => setSearchQuery(event.target.value)}
					leftIcon={
						<MagnifyingGlassIcon
							size={14}
							weight="bold"
							data-flx="voice.soundboard.soundboard-panel.magnifying-glass-icon"
						/>
					}
					className={styles.searchInput}
					data-flx="voice.soundboard.soundboard-panel.search-input"
				/>
			</div>
			{!canUseSoundboard && (
				<p className={styles.noPermissionText} data-flx="voice.soundboard.soundboard-panel.no-permission-text">
					{i18n._(NO_PERMISSION_DESCRIPTOR)}
				</p>
			)}
			<Scroller className={styles.body} data-flx="voice.soundboard.soundboard-panel.scroller">
				{hasAnyResults ? (
					<div className={styles.section} data-flx="voice.soundboard.soundboard-panel.section.guild">
						<h2 className={styles.sectionTitle} data-flx="voice.soundboard.soundboard-panel.section-title.guild">
							{i18n._(SERVER_SOUNDS_DESCRIPTOR, {guildName: guild?.name ?? ''})}
						</h2>
						<div className={styles.grid} data-flx="voice.soundboard.soundboard-panel.grid.guild">
							{filteredGuildSounds.map(renderTile)}
						</div>
					</div>
				) : (
					<p className={styles.emptyText} data-flx="voice.soundboard.soundboard-panel.empty-text">
						{i18n._(NO_SOUNDS_FOUND_DESCRIPTOR)}
					</p>
				)}
			</Scroller>
		</div>
	);
});
