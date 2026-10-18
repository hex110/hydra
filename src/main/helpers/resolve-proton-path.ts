import path from "node:path";
import { db, levelKeys } from "@main/level";
import {
  compareProtonNamesNewestFirst,
  getProtonFlavor,
  parseProtonChoice,
} from "@shared";
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

/**
 * A launch rule's Proton choice as a build path: the path itself when it is a
 * valid build, or the newest installed build of a flavor.
 */
export const resolveProtonChoice = async (
  choice: string | null | undefined
): Promise<string | null> => {
  const parsed = parseProtonChoice(choice);
  if (!parsed) return null;
  if ("path" in parsed) {
    return Umu.isValidProtonPath(parsed.path) ? parsed.path : null;
  }

  const [newest] = (await Umu.getInstalledProtonVersions())
    .filter(
      (version) =>
        getProtonFlavor(path.basename(version.path)) === parsed.flavor
    )
    .sort((a, b) =>
      compareProtonNamesNewestFirst(
        path.basename(a.path),
        path.basename(b.path)
      )
    );
  return newest?.path ?? null;
};

/**
 * The Proton build a game launches with, and where that choice comes from:
 * the game's own pick, then a launch rule's, then the default from settings.
 */
export const resolveGameProton = async (
  game: Pick<Game, "protonPath"> | undefined,
  ruleProtonPath?: string | null
): Promise<{
  path: string | null;
  source: "game" | "rule" | "default" | null;
}> => {
  if (game?.protonPath && Umu.isValidProtonPath(game.protonPath)) {
    return { path: game.protonPath, source: "game" };
  }
  if (ruleProtonPath) return { path: ruleProtonPath, source: "rule" };
  const defaultPath = await resolveProtonPath(null);
  return { path: defaultPath, source: defaultPath ? "default" : null };
};
