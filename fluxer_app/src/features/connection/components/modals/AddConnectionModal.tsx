// SPDX-License-Identifier: AGPL-3.0-or-later

import * as Modal from '@app/features/app/components/dialogs/Modal';
import {useFormSubmit} from '@app/features/app/hooks/useFormSubmit';
import * as ConnectionCommands from '@app/features/connection/commands/ConnectionCommands';
import styles from '@app/features/connection/components/modals/AddConnectionModal.module.css';
import UserConnection from '@app/features/connection/state/UserConnection';
import {
	COPIED_DESCRIPTOR,
	DOMAIN_DESCRIPTOR,
	VERIFY_DESCRIPTOR,
} from '@app/features/i18n/utils/CommonMessageDescriptors';
import {Button} from '@app/features/ui/button/Button';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import * as TextCopyCommands from '@app/features/ui/commands/TextCopyCommands';
import {Form} from '@app/features/ui/components/form/Form';
import {Input} from '@app/features/ui/components/form/FormInput';
import {SteppedCarousel} from '@app/features/ui/stepped_carousel/SteppedCarousel';
import * as FormUtils from '@app/lib/forms';
import {ConnectionTypes} from '@fluxer/constants/src/ConnectionConstants';
import type {ConnectionVerificationResponse} from '@fluxer/schema/src/domains/connection/ConnectionSchemas';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {CheckCircleIcon, ClipboardIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import {useCallback, useMemo, useState} from 'react';
import {useForm} from 'react-hook-form';

const YOU_ALREADY_HAVE_THIS_CONNECTION_DESCRIPTOR = msg({
	message: 'You already have this connection.',
	comment: 'Body text in the connection add connection modal.',
});
const COPY_HOST_DESCRIPTOR = msg({
	message: 'Copy host',
	comment: 'Short label in the connection add connection modal.',
});
const COPY_VALUE_DESCRIPTOR = msg({
	message: 'Copy value',
	comment: 'Short label in the connection add connection modal.',
});
const ADD_CONNECTION_FORM_DESCRIPTOR = msg({
	message: 'Add connection form',
	comment: 'Accessible form label in the connection add connection modal.',
});
const ADD_CONNECTION_DESCRIPTOR = msg({
	message: 'Add connection',
	comment: 'Short label in the connection add connection modal.',
});
const VERIFY_CONNECTION_DESCRIPTOR = msg({
	message: 'Verify connection',
	comment: 'Short label in the connection add connection modal.',
});
const HOST_DESCRIPTOR = msg({
	message: 'Host',
	comment: 'Short label in the connection add connection modal.',
});
const VALUE_DESCRIPTOR = msg({
	message: 'Value',
	comment: 'Short label in the connection add connection modal.',
});
const COPY_RESET_DELAY_MS = 2000;

interface CopyButtonProps {
	copied: boolean;
	disabled?: boolean;
	label: string;
	onClick: () => void;
}

const CopyButton = ({copied, disabled = false, label, onClick}: CopyButtonProps) => (
	<button
		type="button"
		className={styles.copyButton}
		onClick={onClick}
		disabled={disabled}
		aria-label={label}
		data-flx="connection.add-connection-modal.copy-button.copy-button.click"
	>
		{copied ? (
			<CheckCircleIcon
				className={styles.copyIcon}
				size={16}
				weight="bold"
				data-flx="connection.add-connection-modal.copy-button.copy-icon"
			/>
		) : (
			<ClipboardIcon
				className={styles.copyIcon}
				size={16}
				data-flx="connection.add-connection-modal.copy-button.copy-icon--2"
			/>
		)}
	</button>
);

CopyButton.displayName = 'CopyButton';

interface InitiateFormInputs {
	identifier: string;
}

type Step = 'initiate' | 'verify';

const STEP_ORDER: ReadonlyArray<Step> = ['initiate', 'verify'];
export const AddConnectionModal = observer(() => {
	const {i18n} = useLingui();
	const [step, setStep] = useState<Step>('initiate');
	const [verificationData, setVerificationData] = useState<ConnectionVerificationResponse | null>(null);
	const [hostCopied, setHostCopied] = useState(false);
	const [valueCopied, setValueCopied] = useState(false);
	const initiateForm = useForm<InitiateFormInputs>();
	const [isVerifySubmitting, setIsVerifySubmitting] = useState(false);
	const onSubmitInitiate = useCallback(
		async (data: InitiateFormInputs) => {
			const identifier = data.identifier.trim();
			if (UserConnection.hasConnectionByTypeAndName(ConnectionTypes.DOMAIN, identifier)) {
				initiateForm.setError('identifier', {
					type: 'validate',
					message: i18n._(YOU_ALREADY_HAVE_THIS_CONNECTION_DESCRIPTOR),
				});
				return;
			}
			const result = await ConnectionCommands.initiateConnection(i18n, ConnectionTypes.DOMAIN, identifier);
			setVerificationData(result);
			setStep('verify');
		},
		[i18n, initiateForm],
	);
	const handleVerifyConfirm = useCallback(async () => {
		if (!verificationData) return;
		setIsVerifySubmitting(true);
		try {
			await ConnectionCommands.verifyAndCreateConnection(i18n, verificationData.initiation_token);
			ModalCommands.popByType(AddConnectionModal);
		} catch (error) {
			FormUtils.pushApiErrorModal(i18n, error);
		} finally {
			setIsVerifySubmitting(false);
		}
	}, [i18n, verificationData]);
	const {handleSubmit: handleInitiateSubmit} = useFormSubmit({
		form: initiateForm,
		onSubmit: onSubmitInitiate,
		defaultErrorField: 'identifier',
	});
	const hostRecord = useMemo(
		() => (verificationData?.id ? `_fluxer.${verificationData.id}` : ''),
		[verificationData?.id],
	);
	const dnsValue = useMemo(
		() => (verificationData?.token ? `fluxer-verification=${verificationData.token}` : ''),
		[verificationData?.token],
	);
	const dnsUrl = useMemo(
		() => (verificationData?.id ? `https://${verificationData.id}/.well-known/fluxer-verification` : ''),
		[verificationData?.id],
	);
	const handleCopyHost = useCallback(() => {
		if (!hostRecord) return;
		void TextCopyCommands.copy(i18n, hostRecord);
		setHostCopied(true);
		window.setTimeout(() => setHostCopied(false), COPY_RESET_DELAY_MS);
	}, [hostRecord, i18n]);
	const handleCopyValue = useCallback(() => {
		if (!dnsValue) return;
		void TextCopyCommands.copy(i18n, dnsValue);
		setValueCopied(true);
		window.setTimeout(() => setValueCopied(false), COPY_RESET_DELAY_MS);
	}, [dnsValue, i18n]);
	const handleDownloadToken = useCallback(() => {
		if (!verificationData?.token) return;
		const blob = new Blob([verificationData.token], {type: 'text/plain'});
		const blobUrl = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = blobUrl;
		link.download = 'fluxer-verification';
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(blobUrl);
	}, [verificationData?.token]);
	const hostCopyLabel = hostCopied ? i18n._(COPIED_DESCRIPTOR) : i18n._(COPY_HOST_DESCRIPTOR);
	const valueCopyLabel = valueCopied ? i18n._(COPIED_DESCRIPTOR) : i18n._(COPY_VALUE_DESCRIPTOR);
	const renderInitiateStep = () => (
		<Form
			form={initiateForm}
			onSubmit={handleInitiateSubmit}
			aria-label={i18n._(ADD_CONNECTION_FORM_DESCRIPTOR)}
			data-flx="connection.add-connection-modal.form.initiate-submit"
		>
			<div className={styles.stack} data-flx="connection.add-connection-modal.stack">
				<Input
					data-flx="connection.add-connection-modal.input"
					{...initiateForm.register('identifier', {required: true})}
					autoFocus={true}
					error={initiateForm.formState.errors.identifier?.message}
					label={i18n._(DOMAIN_DESCRIPTOR)}
					placeholder="example.com"
					required={true}
				/>
			</div>
		</Form>
	);
	const renderVerifyStep = () => (
		<div className={styles.stack} data-flx="connection.add-connection-modal.stack--2">
			<p className={styles.instructions} data-flx="connection.add-connection-modal.instructions">
				<Trans>Choose one of the methods below to prove domain ownership. You only need to complete one.</Trans>
			</p>
			<div className={styles.dnsCard} data-flx="connection.add-connection-modal.dns-card">
				<div className={styles.dnsHeading} data-flx="connection.add-connection-modal.dns-heading">
					<p className={styles.dnsTitle} data-flx="connection.add-connection-modal.dns-title">
						<Trans>DNS TXT record</Trans>
					</p>
				</div>
				<div className={styles.dnsFields} data-flx="connection.add-connection-modal.dns-fields">
					<Input
						label={i18n._(HOST_DESCRIPTOR)}
						value={hostRecord}
						readOnly={true}
						className={styles.dnsInput}
						rightElement={
							<CopyButton
								onClick={handleCopyHost}
								copied={hostCopied}
								disabled={!hostRecord}
								label={hostCopyLabel}
								data-flx="connection.add-connection-modal.copy-button.copy-host"
							/>
						}
						data-flx="connection.add-connection-modal.dns-input"
					/>
					<Input
						label={i18n._(VALUE_DESCRIPTOR)}
						value={dnsValue}
						readOnly={true}
						className={styles.dnsInput}
						rightElement={
							<CopyButton
								onClick={handleCopyValue}
								copied={valueCopied}
								disabled={!dnsValue}
								label={valueCopyLabel}
								data-flx="connection.add-connection-modal.copy-button.copy-value"
							/>
						}
						data-flx="connection.add-connection-modal.dns-input--2"
					/>
				</div>
			</div>
			{dnsUrl && (
				<div className={styles.orDivider} data-flx="connection.add-connection-modal.or-divider">
					<div className={styles.orDividerLine} data-flx="connection.add-connection-modal.or-divider-line" />
					<span className={styles.orDividerText} data-flx="connection.add-connection-modal.or-divider-text">
						<Trans>or</Trans>
					</span>
					<div className={styles.orDividerLine} data-flx="connection.add-connection-modal.or-divider-line--2" />
				</div>
			)}
			{dnsUrl && (
				<div className={styles.tokenCard} data-flx="connection.add-connection-modal.token-card">
					<div className={styles.tokenCardHeader} data-flx="connection.add-connection-modal.token-card-header">
						<p className={styles.tokenTitle} data-flx="connection.add-connection-modal.token-title">
							<Trans>Serve the token file</Trans>
						</p>
						<p className={styles.tokenSubtitle} data-flx="connection.add-connection-modal.token-subtitle">
							<Trans>
								Host the verification token at{' '}
								<a href={dnsUrl} target="_blank" rel="noopener noreferrer">
									{dnsUrl}
								</a>
								.
							</Trans>
						</p>
					</div>
					<Button
						variant="secondary"
						onClick={handleDownloadToken}
						data-flx="connection.add-connection-modal.download-token-button"
					>
						<Trans>Download token file</Trans>
					</Button>
				</div>
			)}
		</div>
	);
	const renderStepBody = () => (step === 'initiate' ? renderInitiateStep() : renderVerifyStep());
	return (
		<Modal.Root size="medium" centered data-flx="connection.add-connection-modal.modal-root">
			<Modal.Header title={i18n._(ADD_CONNECTION_DESCRIPTOR)} data-flx="connection.add-connection-modal.modal-header" />
			<Modal.Content data-flx="connection.add-connection-modal.modal-content">
				<SteppedCarousel step={step} steps={STEP_ORDER} data-flx="connection.add-connection-modal.stepped-carousel">
					{renderStepBody()}
				</SteppedCarousel>
			</Modal.Content>
			<Modal.Footer data-flx="connection.add-connection-modal.modal-footer">
				{step === 'initiate' ? (
					<Button
						variant="primary"
						onClick={handleInitiateSubmit}
						submitting={initiateForm.formState.isSubmitting}
						data-flx="connection.add-connection-modal.initiate-button"
					>
						{i18n._(VERIFY_DESCRIPTOR)}
					</Button>
				) : (
					<Button
						variant="primary"
						onClick={handleVerifyConfirm}
						submitting={isVerifySubmitting}
						data-flx="connection.add-connection-modal.verify-button"
					>
						{i18n._(VERIFY_CONNECTION_DESCRIPTOR)}
					</Button>
				)}
			</Modal.Footer>
		</Modal.Root>
	);
});
