import path from "node:path";

import type { UserPreferences } from "@types";

/**
 * Settles where games go, once. A fresh install keeps games in ~/Games, as
 * Steam and Heroic do, and deletes archives after a good extraction. An
 * install that already downloaded into the old default (the Downloads
 * folder) keeps it, written down so nothing moves.
 */
export const firstRunDownloadDefaults = (
  preferences: UserPreferences | null,
  options: { hasDownloads: boolean; homePath: string; downloadsPath: string }
): Partial<UserPreferences> | null => {
  if (preferences?.downloadsPath) return null;
  if (options.hasDownloads) return { downloadsPath: options.downloadsPath };
  return {
    downloadsPath: path.join(options.homePath, "Games"),
    deleteArchiveFilesAfterExtractionByDefault:
      preferences?.deleteArchiveFilesAfterExtractionByDefault ?? true,
  };
};
