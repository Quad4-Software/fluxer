// SPDX-License-Identifier: AGPL-3.0-or-later

export type PasswordStrengthLevel = 'empty' | 'weak' | 'fair' | 'good' | 'strong';

export interface PasswordStrengthChecks {
	minLength: boolean;
	hasLowercase: boolean;
	hasUppercase: boolean;
	hasNumber: boolean;
	hasSymbol: boolean;
}

export interface PasswordStrengthResult {
	level: PasswordStrengthLevel;
	score: number;
	checks: PasswordStrengthChecks;
}

const LOWERCASE_PATTERN = /[a-z]/u;
const UPPERCASE_PATTERN = /[A-Z]/u;
const NUMBER_PATTERN = /\d/u;
const SYMBOL_PATTERN = /[^a-zA-Z0-9]/u;

export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
	const checks: PasswordStrengthChecks = {
		minLength: password.length >= 8,
		hasLowercase: LOWERCASE_PATTERN.test(password),
		hasUppercase: UPPERCASE_PATTERN.test(password),
		hasNumber: NUMBER_PATTERN.test(password),
		hasSymbol: SYMBOL_PATTERN.test(password),
	};
	if (password.length === 0) {
		return {level: 'empty', score: 0, checks};
	}
	const varietyCount = [
		checks.hasLowercase,
		checks.hasUppercase,
		checks.hasNumber,
		checks.hasSymbol,
	].filter(Boolean).length;
	let level: PasswordStrengthLevel = 'weak';
	if (!checks.minLength || varietyCount <= 1) {
		level = 'weak';
	} else if (password.length >= 16 && varietyCount >= 3) {
		level = 'strong';
	} else if (password.length >= 12 && varietyCount >= 3) {
		level = 'good';
	} else if (password.length >= 8 && varietyCount >= 2) {
		level = 'fair';
	} else {
		level = 'weak';
	}
	const scoreByLevel: Record<Exclude<PasswordStrengthLevel, 'empty'>, number> = {
		weak: 25,
		fair: 50,
		good: 75,
		strong: 100,
	};
	return {
		level,
		score: scoreByLevel[level],
		checks,
	};
}
