// SPDX-License-Identifier: AGPL-3.0-or-later

import {usePasswordBreachCheck, type PasswordBreachStatus} from '@app/features/auth/hooks/usePasswordBreachCheck';
import {
	evaluatePasswordStrength,
	type PasswordStrengthLevel,
	type PasswordStrengthResult,
} from '@app/features/auth/utils/PasswordStrength';
import styles from '@app/features/ui/components/form/PasswordStrengthFeedback.module.css';
import {msg} from '@lingui/core/macro';
import {Trans, useLingui} from '@lingui/react/macro';
import {CheckIcon, CircleNotchIcon, ShieldCheckIcon, ShieldWarningIcon, XIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import {useMemo} from 'react';

const STRENGTH_WEAK_DESCRIPTOR = msg({
	message: 'Weak',
	comment: 'Password strength label shown when the password is weak.',
});
const STRENGTH_FAIR_DESCRIPTOR = msg({
	message: 'Fair',
	comment: 'Password strength label shown when the password is fair.',
});
const STRENGTH_GOOD_DESCRIPTOR = msg({
	message: 'Good',
	comment: 'Password strength label shown when the password is good.',
});
const STRENGTH_STRONG_DESCRIPTOR = msg({
	message: 'Strong',
	comment: 'Password strength label shown when the password is strong.',
});
const MIN_LENGTH_RULE_DESCRIPTOR = msg({
	message: 'At least 8 characters',
	comment: 'Password strength rule shown during registration.',
});
const LOWERCASE_RULE_DESCRIPTOR = msg({
	message: 'Lowercase letter',
	comment: 'Password strength rule shown during registration.',
});
const UPPERCASE_RULE_DESCRIPTOR = msg({
	message: 'Uppercase letter',
	comment: 'Password strength rule shown during registration.',
});
const NUMBER_RULE_DESCRIPTOR = msg({
	message: 'Number',
	comment: 'Password strength rule shown during registration.',
});
const SYMBOL_RULE_DESCRIPTOR = msg({
	message: 'Symbol',
	comment: 'Password strength rule shown during registration.',
});

interface PasswordStrengthFeedbackProps {
	password: string;
	showBreachCheck?: boolean;
	className?: string;
}

function getStrengthLabel(level: PasswordStrengthLevel, i18n: ReturnType<typeof useLingui>['i18n']): string {
	switch (level) {
		case 'weak':
			return i18n._(STRENGTH_WEAK_DESCRIPTOR);
		case 'fair':
			return i18n._(STRENGTH_FAIR_DESCRIPTOR);
		case 'good':
			return i18n._(STRENGTH_GOOD_DESCRIPTOR);
		case 'strong':
			return i18n._(STRENGTH_STRONG_DESCRIPTOR);
		default:
			return '';
	}
}

function getStrengthValueClass(level: PasswordStrengthLevel): string | undefined {
	switch (level) {
		case 'weak':
			return styles.strengthValueWeak;
		case 'fair':
			return styles.strengthValueFair;
		case 'good':
			return styles.strengthValueGood;
		case 'strong':
			return styles.strengthValueStrong;
		default:
			return undefined;
	}
}

function getMeterFillClass(level: PasswordStrengthLevel): string | undefined {
	switch (level) {
		case 'weak':
			return styles.meterFillWeak;
		case 'fair':
			return styles.meterFillFair;
		case 'good':
			return styles.meterFillGood;
		case 'strong':
			return styles.meterFillStrong;
		default:
			return undefined;
	}
}

function renderBreachIcon(status: PasswordBreachStatus) {
	switch (status) {
		case 'checking':
			return (
				<CircleNotchIcon
					size={16}
					weight="bold"
					className={clsx(styles.breachIcon, styles.breachIconChecking)}
					data-flx="ui.form.password-strength-feedback.breach-icon.checking"
				/>
			);
		case 'safe':
			return (
				<ShieldCheckIcon
					size={16}
					weight="fill"
					className={clsx(styles.breachIcon, styles.breachIconSafe)}
					data-flx="ui.form.password-strength-feedback.breach-icon.safe"
				/>
			);
		case 'breached':
			return (
				<ShieldWarningIcon
					size={16}
					weight="fill"
					className={clsx(styles.breachIcon, styles.breachIconBreached)}
					data-flx="ui.form.password-strength-feedback.breach-icon.breached"
				/>
			);
		default:
			return (
				<ShieldCheckIcon
					size={16}
					weight="fill"
					className={clsx(styles.breachIcon, styles.breachIconUnavailable)}
					data-flx="ui.form.password-strength-feedback.breach-icon.unavailable"
				/>
			);
	}
}

function renderBreachCopy(status: PasswordBreachStatus) {
	switch (status) {
		case 'checking':
			return (
				<>
					<span className={styles.breachTitle} data-flx="ui.form.password-strength-feedback.breach-title">
						<Trans>Checking breach database</Trans>
					</span>
					<span className={styles.breachDescription} data-flx="ui.form.password-strength-feedback.breach-description">
						<Trans>Looking to see whether this password appears in known data breaches.</Trans>
					</span>
				</>
			);
		case 'safe':
			return (
				<>
					<span className={styles.breachTitle} data-flx="ui.form.password-strength-feedback.breach-title">
						<Trans>Not found in known breaches</Trans>
					</span>
					<span className={styles.breachDescription} data-flx="ui.form.password-strength-feedback.breach-description">
						<Trans>This password does not appear in our breach database.</Trans>
					</span>
				</>
			);
		case 'breached':
			return (
				<>
					<span className={styles.breachTitle} data-flx="ui.form.password-strength-feedback.breach-title">
						<Trans>Found in a data breach</Trans>
					</span>
					<span className={styles.breachDescription} data-flx="ui.form.password-strength-feedback.breach-description">
						<Trans>This password has appeared in known breaches. Choose a different one.</Trans>
					</span>
				</>
			);
		default:
			return (
				<>
					<span className={styles.breachTitle} data-flx="ui.form.password-strength-feedback.breach-title">
						<Trans>Breach check unavailable</Trans>
					</span>
					<span className={styles.breachDescription} data-flx="ui.form.password-strength-feedback.breach-description">
						<Trans>We could not check this password right now. You can still continue.</Trans>
					</span>
				</>
			);
	}
}

function buildRules(strength: PasswordStrengthResult, i18n: ReturnType<typeof useLingui>['i18n']) {
	return [
		{key: 'minLength', valid: strength.checks.minLength, label: i18n._(MIN_LENGTH_RULE_DESCRIPTOR)},
		{key: 'lowercase', valid: strength.checks.hasLowercase, label: i18n._(LOWERCASE_RULE_DESCRIPTOR)},
		{key: 'uppercase', valid: strength.checks.hasUppercase, label: i18n._(UPPERCASE_RULE_DESCRIPTOR)},
		{key: 'number', valid: strength.checks.hasNumber, label: i18n._(NUMBER_RULE_DESCRIPTOR)},
		{key: 'symbol', valid: strength.checks.hasSymbol, label: i18n._(SYMBOL_RULE_DESCRIPTOR)},
	];
}

export const PasswordStrengthFeedback = observer(function PasswordStrengthFeedback({
	password,
	showBreachCheck = true,
	className,
}: PasswordStrengthFeedbackProps) {
	const {i18n} = useLingui();
	const strength = useMemo(() => evaluatePasswordStrength(password), [password]);
	const breachStatus = usePasswordBreachCheck(password, showBreachCheck);
	if (password.length === 0) {
		return null;
	}
	const rules = buildRules(strength, i18n);
	const showBreachPanel = showBreachCheck && password.length >= 8;
	return (
		<div className={clsx(styles.container, className)} data-flx="ui.form.password-strength-feedback.container">
			<div className={styles.strengthSection} data-flx="ui.form.password-strength-feedback.strength-section">
				<div className={styles.strengthHeader} data-flx="ui.form.password-strength-feedback.strength-header">
					<span className={styles.strengthLabel} data-flx="ui.form.password-strength-feedback.strength-label">
						<Trans>Password strength</Trans>
					</span>
					<span
						className={clsx(styles.strengthValue, getStrengthValueClass(strength.level))}
						data-flx="ui.form.password-strength-feedback.strength-value"
					>
						{getStrengthLabel(strength.level, i18n)}
					</span>
				</div>
				<div className={styles.meterTrack} data-flx="ui.form.password-strength-feedback.meter-track">
					<div
						className={clsx(styles.meterFill, getMeterFillClass(strength.level))}
						style={{width: `${strength.score}%`}}
						data-flx="ui.form.password-strength-feedback.meter-fill"
					/>
				</div>
				<div className={styles.rules} data-flx="ui.form.password-strength-feedback.rules">
					{rules.map((rule) => (
						<div key={rule.key} className={styles.rule} data-flx="ui.form.password-strength-feedback.rule">
							<div className={styles.iconContainer} data-flx="ui.form.password-strength-feedback.icon-container">
								{rule.valid ? (
									<CheckIcon
										weight="bold"
										size={14}
										className={styles.iconValid}
										data-flx="ui.form.password-strength-feedback.icon-valid"
									/>
								) : (
									<XIcon
										weight="bold"
										size={14}
										className={styles.iconPending}
										data-flx="ui.form.password-strength-feedback.icon-pending"
									/>
								)}
							</div>
							<span
								className={rule.valid ? styles.ruleLabelValid : styles.ruleLabelPending}
								data-flx="ui.form.password-strength-feedback.rule-label"
							>
								{rule.label}
							</span>
						</div>
					))}
				</div>
			</div>
			{showBreachPanel ? (
				<div
					className={clsx(
						styles.breachRow,
						breachStatus === 'safe' && styles.breachRowSafe,
						breachStatus === 'breached' && styles.breachRowBreached,
					)}
					data-flx="ui.form.password-strength-feedback.breach-row"
				>
					{renderBreachIcon(breachStatus)}
					<div className={styles.breachCopy} data-flx="ui.form.password-strength-feedback.breach-copy">
						{renderBreachCopy(breachStatus)}
					</div>
				</div>
			) : null}
		</div>
	);
});
