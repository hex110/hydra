import { db, levelKeys } from "@main/level";
import { Umu } from "@main/services/umu";
import type { Game, UserPreferences } from "@types";

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

/** The Proton build a game launches with, and where that choice comes from. */
export const resolveGameProton = async (
  game: Pick<Game, "protonPath">
): Promise<{
  path: string | null;
  source: "game" | "default" | null;
}> => {
  if (game.protonPath && Umu.isValidProtonPath(game.protonPath)) {
    return { path: game.protonPath, source: "game" };
  }
  const path = await resolveProtonPath(null);
  return { path, source: path ? "default" : null };
};
