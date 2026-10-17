import type { Game, LaunchRule, UserPreferences } from "@types";
import {
  HDR_LAUNCH_RULE_ID,
  LAUNCH_RULE_PRESETS,
  resolveLaunchRules,
} from "./launch-rules.js";

export interface LegacyLaunchSettingsMigration {
  /** The new launch rules, or null when the preferences need no change. */
  launchRules: LaunchRule[] | null;
  /** New overrides per game key, for games that had legacy settings. */
  gameOverrides: Map<string, Record<string, boolean>>;
}

const hdrPreset = LAUNCH_RULE_PRESETS.find(
  (rule) => rule.id === HDR_LAUNCH_RULE_ID
)!;

/**
 * Turns the old HDR switch (global and per game) into the HDR launch rule and
 * its per-game overrides, and old per-game "ignored rules" into overrides.
 */
export const migrateLegacyLaunchSettings = (
  preferences: UserPreferences | null,
  games: [string, Game][]
): LegacyLaunchSettingsMigration => {
  const gameOverrides = new Map<string, Record<string, boolean>>();
  let usesHdr = preferences?.enableHdr !== undefined;

  for (const [gameKey, game] of games) {
    const hasHdr = typeof game.hdrEnabled === "boolean";
    const ignored = game.ignoredLaunchRules ?? [];
    if (
      !hasHdr &&
      ignored.length === 0 &&
      !("hdrEnabled" in game) &&
      !("ignoredLaunchRules" in game)
    ) {
      continue;
    }

    const overrides = { ...game.launchRuleOverrides };
    for (const ruleId of ignored) overrides[ruleId] = false;
    if (hasHdr) {
      overrides[HDR_LAUNCH_RULE_ID] = game.hdrEnabled as boolean;
      usesHdr = true;
    }
    gameOverrides.set(gameKey, overrides);
  }

  if (!usesHdr) return { launchRules: null, gameOverrides };

  const rules = resolveLaunchRules(preferences?.launchRules);
  const enabled =
    preferences?.enableHdr === undefined
      ? undefined
      : preferences.enableHdr === true;
  const hasRule = rules.some((rule) => rule.id === HDR_LAUNCH_RULE_ID);

  return {
    launchRules: hasRule
      ? rules.map((rule) =>
          rule.id === HDR_LAUNCH_RULE_ID && enabled !== undefined
            ? { ...rule, enabled }
            : rule
        )
      : [...rules, { ...hdrPreset, enabled: enabled ?? false }],
    gameOverrides,
  };
};
