import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import type { Game, GameShop, UserPreferences } from "@types";

/** Upstream Hydra's data folder name under the platform's app data folder. */
export const HYDRA_LAUNCHER_FOLDER = "hydralauncher";

/** Where upstream Hydra keeps each game's Wine prefix. */
export interface HydraLauncherLibrary {
  dataPath: string;
  defaultPrefixPath: string | null;
  /** Prefixes set per game, keyed `shop:objectId`. */
  gamePrefixes: Map<string, string>;
}

const gameKey = (shop: GameShop, objectId: string) => `${shop}:${objectId}`;

const isDirectory = (target: string) =>
  fs.statSync(target, { throwIfNoEntry: false })?.isDirectory() === true;

/** Upstream Hydra's data folder, or null when it was never run here. */
export const findHydraLauncherDataPath = (appDataPath: string) => {
  const dataPath = path.join(appDataPath, HYDRA_LAUNCHER_FOLDER);
  return isDirectory(path.join(dataPath, "hydra-db")) ? dataPath : null;
};

/**
 * Reads upstream Hydra's prefix settings from a copy of its database, since
 * upstream holds the database's lock while it runs.
 */
export const readHydraLauncherLibrary = async (
  dataPath: string,
  snapshotPath: string
): Promise<HydraLauncherLibrary> => {
  await fs.promises.rm(snapshotPath, { recursive: true, force: true });
  await fs.promises.cp(path.join(dataPath, "hydra-db"), snapshotPath, {
    recursive: true,
    filter: (source) => path.basename(source) !== "LOCK",
  });

  const db = new ClassicLevel<string, unknown>(snapshotPath, {
    valueEncoding: "json",
  });
  try {
    const preferences = (await db
      .get("userPreferences")
      .catch(() => null)) as UserPreferences | null;

    const gamePrefixes = new Map<string, string>();
    const games = db.sublevel<string, Game>("games", { valueEncoding: "json" });
    for await (const [key, game] of games.iterator()) {
      if (game?.winePrefixPath) gamePrefixes.set(key, game.winePrefixPath);
    }

    return {
      dataPath,
      defaultPrefixPath: preferences?.defaultWinePrefixPath ?? null,
      gamePrefixes,
    };
  } finally {
    await db.close();
    await fs.promises.rm(snapshotPath, { recursive: true, force: true });
  }
};

/** The prefix upstream Hydra runs a game in, as upstream resolves it. */
export const getHydraLauncherPrefix = (
  library: HydraLauncherLibrary,
  game: Pick<Game, "shop" | "objectId">
) =>
  library.gamePrefixes.get(gameKey(game.shop, game.objectId)) ??
  path.join(
    library.defaultPrefixPath ?? path.join(library.dataPath, "wine-prefixes"),
    game.objectId
  );
