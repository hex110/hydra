import fs from "node:fs";
import path from "node:path";
import { db, gamesSublevel, levelKeys } from "@main/level";
import { getDirectorySize } from "@main/events/helpers/get-directory-size";
import { Ludusavi } from "./ludusavi";
import { logger } from "./logger";
import { SystemPath } from "./system-path";
import type { GameSaveBackups, GameShop, UserPreferences } from "@types";

const getBackupsRoot = () =>
  path.join(SystemPath.getPath("userData"), "save-import", "backups");

export const getGameBackupsDirectory = (shop: GameShop, objectId: string) =>
  path.join(getBackupsRoot(), `${shop}-${objectId}`);

export const newBackupStamp = () =>
  new Date().toISOString().replaceAll(":", "-");

const listBackupFolders = async (directory: string) => {
  const entries = await fs.promises
    .readdir(directory, { withFileTypes: true })
    .catch(() => [] as fs.Dirent[]);
  // Stamps sort by time; "-update" and other suffixes come after the time.
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
};

const parseGameFolder = (name: string) => {
  const separator = name.indexOf("-");
  if (separator === -1) return null;
  return {
    shop: name.slice(0, separator) as GameShop,
    objectId: name.slice(separator + 1),
  };
};

/**
 * Copies of save files Hydra keeps before it changes them: the files a save
 * import replaces, and a full Ludusavi backup before a game is updated.
 * Each lives in its own timestamped folder per game.
 */
export class SaveBackups {
  private static async getKeepCount() {
    const preferences = await db
      .get<string, UserPreferences | null>(levelKeys.userPreferences, {
        valueEncoding: "json",
      })
      .catch(() => null);
    const keep = preferences?.saveBackupsToKeep;
    return typeof keep === "number" && keep > 0 ? Math.floor(keep) : null;
  }

  /** Backs up a game's saves with Ludusavi. Returns the folder, or null when nothing was found. */
  public static async backupBeforeUpdate(
    shop: GameShop,
    objectId: string,
    winePrefixPath: string | null
  ) {
    const directory = path.join(
      getGameBackupsDirectory(shop, objectId),
      `${newBackupStamp()}-update`
    );

    try {
      const result = await Ludusavi.backupGame(
        shop,
        objectId,
        directory,
        winePrefixPath
      );
      const files = Object.keys(result.games?.[objectId]?.files ?? {}).length;
      if (files === 0) {
        await fs.promises.rm(directory, { recursive: true, force: true });
        return null;
      }
      await this.prune(shop, objectId);
      return directory;
    } catch (error) {
      await fs.promises.rm(directory, { recursive: true, force: true });
      throw error;
    }
  }

  /** Deletes the oldest backups of a game beyond the configured count. */
  public static async prune(shop: GameShop, objectId: string) {
    const keep = await this.getKeepCount();
    if (!keep) return 0;

    const directory = getGameBackupsDirectory(shop, objectId);
    const folders = await listBackupFolders(directory);
    const excess = folders.slice(0, Math.max(0, folders.length - keep));

    for (const folder of excess) {
      await fs.promises.rm(path.join(directory, folder), {
        recursive: true,
        force: true,
      });
    }

    if (excess.length > 0) {
      logger.info("[SaveBackups] Removed old backups", {
        game: `${shop}:${objectId}`,
        removed: excess.length,
      });
    }
    return excess.length;
  }

  public static async pruneAll() {
    let removed = 0;
    for (const backups of await this.list()) {
      removed += await this.prune(backups.shop, backups.objectId);
    }
    return removed;
  }

  public static async getForGame(
    shop: GameShop,
    objectId: string
  ): Promise<GameSaveBackups | null> {
    const directory = getGameBackupsDirectory(shop, objectId);
    const folders = await listBackupFolders(directory);
    if (folders.length === 0) return null;

    const game = await gamesSublevel.get(levelKeys.game(shop, objectId));
    return {
      shop,
      objectId,
      title: game?.title ?? objectId,
      directory,
      count: folders.length,
      sizeInBytes: await getDirectorySize(directory),
      latest: folders[folders.length - 1],
    };
  }

  public static async list(): Promise<GameSaveBackups[]> {
    const entries = await fs.promises
      .readdir(getBackupsRoot(), { withFileTypes: true })
      .catch(() => [] as fs.Dirent[]);

    const backups: GameSaveBackups[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const game = parseGameFolder(entry.name);
      if (!game) continue;
      const found = await this.getForGame(game.shop, game.objectId);
      if (found) backups.push(found);
    }

    return backups.sort((a, b) => b.sizeInBytes - a.sizeInBytes);
  }

  public static async delete(shop: GameShop, objectId: string) {
    await fs.promises.rm(getGameBackupsDirectory(shop, objectId), {
      recursive: true,
      force: true,
    });
  }
}
