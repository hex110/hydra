import { db, levelKeys } from "@main/level";
import { Umu } from "@main/services/umu";
import type { UserPreferences } from "@types";

/** The game's own Proton, else the default from settings, else umu's default. */
export const resolveProtonPath = async (
  gameProtonPath?: string | null
): Promise<string | null> => {
  if (gameProtonPath && Umu.isValidProtonPath(gameProtonPath)) {
    return gameProtonPath;
  }

  const userPreferences = await db
    .get<string, UserPreferences | null>(levelKeys.userPreferences, {
      valueEncoding: "json",
    })
    .catch(() => null);

  const defaultProtonPath = userPreferences?.defaultProtonPath;

  if (defaultProtonPath && Umu.isValidProtonPath(defaultProtonPath)) {
    return defaultProtonPath;
  }

  return null;
};
