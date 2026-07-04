// SPDX-License-Identifier: AGPL-3.0-or-later

import {GuildFeatures} from '@fluxer/constants/src/GuildConstants';
import {MAX_GUILD_MEMBERS_VERY_LARGE_GUILD} from '@fluxer/constants/src/LimitConstants';
import type {LimitConfigSnapshot, LimitRule} from '@fluxer/limits/src/LimitTypes';
import {describe, expect, test} from 'vitest';
import {
	createDefaultLimitConfig,
	mergeWithCurrentDefaults,
	sanitizeLimitConfigForInstance,
} from '../../constants/LimitConfig';

interface LegacyLimitRule extends LimitRule {
	unlockedFeatures?: Array<string>;
}

interface LegacyLimitConfigSnapshot extends Omit<LimitConfigSnapshot, 'rules'> {
	rules: Array<LegacyLimitRule>;
}

describe('Limit config defaults', () => {
	test('hosted defaults include premium, default, and very large guild limit rules', () => {
		const config = createDefaultLimitConfig({selfHosted: false});
		const premiumRule = config.rules.find((rule) => rule.id === 'premium');
		const defaultRule = config.rules.find((rule) => rule.id === 'default');
		const veryLargeGuildRule = config.rules.find((rule) => rule.id === 'very_large_guild');
		expect(premiumRule).toBeDefined();
		expect(defaultRule).toBeDefined();
		expect(veryLargeGuildRule).toMatchObject({
			filters: {guildFeatures: [GuildFeatures.VERY_LARGE_GUILD]},
			limits: {max_guild_members: MAX_GUILD_MEMBERS_VERY_LARGE_GUILD},
		});
		expect(config.rules.map((rule) => rule.id)).toEqual(['premium', 'default', 'very_large_guild']);
	});
	test('self-hosted defaults include default and very large guild limit rules', () => {
		const config = createDefaultLimitConfig({selfHosted: true});
		const veryLargeGuildRule = config.rules.find((rule) => rule.id === 'very_large_guild');
		expect(veryLargeGuildRule).toMatchObject({
			filters: {guildFeatures: [GuildFeatures.VERY_LARGE_GUILD]},
			limits: {max_guild_members: MAX_GUILD_MEMBERS_VERY_LARGE_GUILD},
		});
		expect(config.rules.map((rule) => rule.id)).toEqual(['default', 'very_large_guild']);
	});
});

describe('Limit config default merge', () => {
	test('switching from everyone to mirror mode applies the restricted free tier instead of carrying over stock limits', () => {
		const everyoneConfig = createDefaultLimitConfig({selfHosted: true, premiumMode: 'everyone'});
		const merged = mergeWithCurrentDefaults(everyoneConfig, {selfHosted: true, premiumMode: 'mirror'});
		const defaultRule = merged.rules.find((rule) => rule.id === 'default');
		const premiumRule = merged.rules.find((rule) => rule.id === 'premium');
		expect(premiumRule).toBeDefined();
		expect(defaultRule?.limits.feature_per_guild_profiles).toBe(0);
		expect(defaultRule?.limits.max_guilds).toBe(100);
		expect(premiumRule?.limits.feature_per_guild_profiles).toBe(1);
		expect(defaultRule?.modifiedFields ?? []).not.toContain('feature_per_guild_profiles');
	});

	test('switching from mirror to everyone mode grants stock limits to every user', () => {
		const mirrorConfig = createDefaultLimitConfig({selfHosted: true, premiumMode: 'mirror'});
		const merged = sanitizeLimitConfigForInstance(
			mergeWithCurrentDefaults(mirrorConfig, {selfHosted: true, premiumMode: 'everyone'}),
			{selfHosted: true, premiumMode: 'everyone'},
		);
		const defaultRule = merged.rules.find((rule) => rule.id === 'default');
		expect(merged.rules.find((rule) => rule.id === 'premium')).toBeUndefined();
		expect(defaultRule?.limits.feature_per_guild_profiles).toBe(1);
		expect(defaultRule?.limits.max_guilds).toBe(200);
	});

	test('genuine admin customizations that do not match either tier default survive a mode switch', () => {
		const everyoneConfig = createDefaultLimitConfig({selfHosted: true, premiumMode: 'everyone'});
		const customized: LimitConfigSnapshot = {
			...everyoneConfig,
			rules: everyoneConfig.rules.map((rule) =>
				rule.id === 'default' ? {...rule, limits: {...rule.limits, max_guilds: 42}} : rule,
			),
		};
		const merged = mergeWithCurrentDefaults(customized, {selfHosted: true, premiumMode: 'mirror'});
		const defaultRule = merged.rules.find((rule) => rule.id === 'default');
		expect(defaultRule?.limits.max_guilds).toBe(42);
		expect(defaultRule?.modifiedFields).toContain('max_guilds');
	});
});

describe('Limit config default merge (legacy)', () => {
	test('legacy unlocked features on known rules are dropped during merge', () => {
		const legacyConfig: LegacyLimitConfigSnapshot = {
			traitDefinitions: ['premium'],
			rules: [
				{
					id: 'premium',
					filters: {traits: ['premium']},
					limits: {},
					unlockedFeatures: ['MORE_EMOJI', 'UNLIMITED_EMOJI'],
				},
				{
					id: 'default',
					limits: {},
				},
			],
		};
		const merged = mergeWithCurrentDefaults(legacyConfig, {selfHosted: false});
		const premiumRule = merged.rules.find((rule) => rule.id === 'premium') as Record<string, unknown> | undefined;
		expect(premiumRule?.unlockedFeatures).toBeUndefined();
	});
});
