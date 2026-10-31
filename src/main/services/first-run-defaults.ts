import fs from "node:fs";

import { db, downloadsSublevel, gamesSublevel, levelKeys } from "@main/level";
import type { UserPreferences } from "@types";

import { firstRunDownloadDefaults } from "./first-run-defaults-core";
import { logger } from "./logger";
import { SystemPath } from "./system-path";

export const applyFirstRunDownloadDefaults = async () => {
  if (process.platform !== "linux") return;
  try {
    const preferences = await db
      .get<string, UserPreferences | null>(levelKeys.userPreferences, {
        valueEncoding: "json",
      })
      .catch(() => null);
    if (preferences?.downloadsPath) return;

    const [downloads, games] = await Promise.all([
      downloadsSublevel.keys().all(),
      gamesSublevel.values().all(),
    ]);
    const patch = firstRunDownloadDefaults(preferences, {
      hasDownloads:
        downloads.length > 0 || games.some((game) => !!game.executablePath),
      homePath: SystemPath.getPath("home"),
      downloadsPath: SystemPath.getPath("downloads"),
    });
    if (!patch) return;

    if (patch.downloadsPath)
      fs.mkdirSync(patch.downloadsPath, { recursive: true });
    await db.put<string, UserPreferences>(
      levelKeys.userPreferences,
      { ...preferences, ...patch },
      { valueEncoding: "json" }
    );
    logger.info("Settled where downloads go", patch);
  } catch (error) {
    logger.error("Could not settle the download folder", error);
  }
};
