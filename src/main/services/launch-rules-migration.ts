import { db, gamesSublevel, levelKeys } from "@main/level";
import { logger } from "@main/services/logger";
import { migrateLegacyLaunchSettings, migrateReShadeLaunchRule } from "@shared";
import type { UserPreferences } from "@types";

/** Moves the old HDR switch and ignored-rule lists onto launch rules. */
export const migrateLegacyLaunchRuleSettings = async () => {
  try {
    const preferences = await db
      .get<string, UserPreferences | null>(levelKeys.userPreferences, {
        valueEncoding: "json",
      })
      .catch(() => null);
    const games = await gamesSublevel.iterator().all();

    const { launchRules, gameOverrides } = migrateLegacyLaunchSettings(
      preferences,
      games
    );

    for (const [gameKey, game] of games) {
      const overrides = gameOverrides.get(gameKey);
      if (!overrides) continue;
      const { hdrEnabled, ignoredLaunchRules, ...rest } = game;
      void hdrEnabled;
      void ignoredLaunchRules;
      await gamesSublevel.put(gameKey, {
        ...rest,
        launchRuleOverrides: overrides,
      });
    }

    if (launchRules || preferences?.enableHdr !== undefined) {
      const { enableHdr, ...rest } = preferences ?? {};
      void enableHdr;
      await db.put<string, UserPreferences>(
        levelKeys.userPreferences,
        { ...rest, ...(launchRules ? { launchRules } : {}) },
        { valueEncoding: "json" }
      );
    }

    await migrateReShadeRule();

    if (launchRules || gameOverrides.size > 0) {
      logger.info("[LaunchRules] Migrated legacy launch settings", {
        games: gameOverrides.size,
      });
    }
  } catch (error) {
    logger.error(
      "[LaunchRules] Failed to migrate legacy launch settings",
      error
    );
  }
};

/** Moves a saved ReShade rule off the override that stopped games from starting. */
const migrateReShadeRule = async () => {
  const preferences = await db
    .get<string, UserPreferences | null>(levelKeys.userPreferences, {
      valueEncoding: "json",
    })
    .catch(() => null);
  const launchRules = migrateReShadeLaunchRule(preferences?.launchRules);
  if (!launchRules || !preferences) return;

  await db.put<string, UserPreferences>(
    levelKeys.userPreferences,
    { ...preferences, launchRules },
    { valueEncoding: "json" }
  );
  logger.info("[LaunchRules] Updated the saved ReShade rule");
};
