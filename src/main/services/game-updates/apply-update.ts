import fs from "node:fs";
import path from "node:path";
import { downloadsSublevel, gamesSublevel, levelKeys } from "@main/level";
import { getDirectorySize } from "@main/events/helpers/get-directory-size";
import { findOrGuessGameExecutable } from "@main/helpers/find-game-executable";
import { updateGameExecutablePath } from "@main/helpers/update-executable-path";
import { GameExecutables } from "@main/services/game-executables";
import { isGameRunning } from "@main/services/game-running-state";
import { GameSetup } from "@main/services/game-setup";
import { logger } from "@main/services/logger";
import {
  publishGameUpdateFailedNotification,
  publishGameUpdatedNotification,
} from "@main/services/notifications";
import { SaveBackups } from "@main/services/save-backups";
import { WindowManager } from "@main/services/window-manager";
import { Wine } from "@main/services/wine";
import type { Download, Game, GameUpdateFailure, GameShop } from "@types";
import { toInstalledVersion } from "./installed-version";
import {
  locateUpdateRoot,
  looksLikeInstaller,
  mergeDirectoryInto,
} from "./update-files";

class UpdateFailure extends Error {
  constructor(public readonly code: GameUpdateFailure) {
    super(code);
  }
}

const backupSaves = async (game: Game, executablePath: string) => {
  const winePrefixPath =
    process.platform === "linux" &&
    path.extname(executablePath).toLowerCase() === ".exe"
      ? await Wine.resolvePrefixPath(
          Wine.getEffectivePrefixPath(game.winePrefixPath, game.objectId)
        )
      : null;

  try {
    return await SaveBackups.backupBeforeUpdate(
      game.shop,
      game.objectId,
      winePrefixPath
    );
  } catch (error) {
    // Ludusavi has no entry for many games; their saves are not touched below.
    logger.warn("[GameUpdates] Could not back up saves before updating", {
      game: game.title,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

/**
 * Installs a downloaded update over the game's current folder. The new files
 * replace the old ones at the same paths; files only the installed copy has
 * (saves, configs, mods, OptiScaler) stay. The prefix, launch options and
 * setup state belong to the game record, which is kept.
 */
export class GameUpdater {
  private static readonly running = new Set<string>();

  public static async applyDownloadedUpdate(shop: GameShop, objectId: string) {
    const gameKey = levelKeys.game(shop, objectId);
    if (this.running.has(gameKey)) return;
    this.running.add(gameKey);

    try {
      const [game, download] = await Promise.all([
        gamesSublevel.get(gameKey),
        downloadsSublevel.get(gameKey),
      ]);
      if (!game || !download?.update || !download.folderName) return;

      await this.apply(gameKey, game, download);
    } catch (error) {
      const code = error instanceof UpdateFailure ? error.code : "failed";
      logger.error("[GameUpdates] Update failed", { gameKey, code, error });
      const game = await gamesSublevel.get(gameKey);
      if (game) void publishGameUpdateFailedNotification(game, code);
      WindowManager.sendToAppWindows("on-game-update-failed", {
        shop,
        objectId,
        code,
      });
    } finally {
      this.running.delete(gameKey);
    }
  }

  private static async apply(gameKey: string, game: Game, download: Download) {
    const { installDirectory, executablePath } = download.update!;
    const extractedDirectory = path.resolve(
      download.downloadPath,
      download.folderName!
    );

    if (isGameRunning(game.objectId, game.shop)) {
      throw new UpdateFailure("game-running");
    }
    if (!fs.existsSync(installDirectory)) {
      throw new UpdateFailure("install-missing");
    }

    const extractedStats = await fs.promises
      .stat(extractedDirectory)
      .catch(() => null);
    if (!extractedStats?.isDirectory()) {
      throw new UpdateFailure("not-extracted");
    }

    const sameFolder = extractedDirectory === path.resolve(installDirectory);
    // Merging, then deleting, a folder that contains the game would delete it.
    const relativeInstall = path.relative(extractedDirectory, installDirectory);
    if (
      !sameFolder &&
      !relativeInstall.startsWith("..") &&
      !path.isAbsolute(relativeInstall)
    ) {
      throw new UpdateFailure("layout-mismatch");
    }

    const updateRoot = sameFolder
      ? installDirectory
      : await locateUpdateRoot(
          extractedDirectory,
          installDirectory,
          executablePath
        );

    if (!updateRoot) {
      throw new UpdateFailure(
        (await looksLikeInstaller(extractedDirectory))
          ? "installer"
          : "layout-mismatch"
      );
    }

    const backupPath = await backupSaves(game, executablePath);

    let movedFiles = 0;
    if (!sameFolder) {
      movedFiles = await mergeDirectoryInto(updateRoot, installDirectory);
      await fs.promises.rm(extractedDirectory, {
        recursive: true,
        force: true,
      });
    }

    const nextExecutable = fs.existsSync(executablePath)
      ? executablePath
      : await findOrGuessGameExecutable(
          installDirectory,
          GameExecutables.getExecutablesForGame(game.objectId),
          game.title
        );

    const refreshed = (await gamesSublevel.get(gameKey)) ?? game;
    const withExecutable = nextExecutable
      ? updateGameExecutablePath(refreshed, nextExecutable)
      : refreshed;

    await gamesSublevel.put(gameKey, {
      ...withExecutable,
      installedVersion: download.release
        ? toInstalledVersion(download.release, installDirectory, "update")
        : null,
      availableUpdate: null,
      installedSizeInBytes: await getDirectorySize(installDirectory),
    });

    // The download now points at the installed folder, like a fresh install.
    await downloadsSublevel.put(gameKey, {
      ...download,
      downloadPath: path.dirname(installDirectory),
      folderName: path.basename(installDirectory),
      update: null,
    });

    logger.info("[GameUpdates] Updated game in place", {
      gameKey,
      release: download.release?.title,
      installDirectory,
      movedFiles,
      backupPath,
    });

    WindowManager.sendDownloadsUpdated();
    WindowManager.sendToAppWindows("on-library-batch-complete");
    void GameSetup.enqueue(game.shop, game.objectId, { reason: "update" });
    void publishGameUpdatedNotification(game, download.release?.title ?? null);
  }
}
