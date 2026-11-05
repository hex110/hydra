import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { gamesSublevel, levelKeys } from "@main/level";
import { getWindowsExecutable } from "@main/helpers/windows-game";
import { SevenZip } from "@main/services/7zip";
import { downloadToFile } from "@main/services/download-to-file";
import { updateGameRecord } from "@main/services/game-record-updater";
import { logger } from "@main/services/logger";
import { SystemPath } from "@main/services/system-path";
import { resolveOptiScalerInstallDirectory } from "@main/services/optiscaler/game-files";
import { findWidescreenPatch, type WidescreenPatchDefinition } from "@shared";
import type {
  Game,
  GameShop,
  GameWidescreenPatchInstallation,
  GameWidescreenPatchStatus,
} from "@types";
import {
  WIDESCREEN_MANIFEST_FILE,
  findMissingWidescreenFiles,
  findWidescreenConflict,
  installWidescreenPatch,
  planWidescreenFiles,
  readWidescreenManifest,
  uninstallWidescreenPatch,
} from "./game-files";

export type WidescreenPatchErrorCode =
  | "not-found"
  | "no-patch"
  | "not-windows-game"
  | "conflict"
  | "download-failed";

export class WidescreenPatchError extends Error {
  constructor(
    public readonly code: WidescreenPatchErrorCode,
    message: string
  ) {
    super(message);
  }
}

const getCacheDirectory = (patch: WidescreenPatchDefinition) =>
  path.join(
    SystemPath.getPath("userData"),
    "widescreen-patches",
    patch.id,
    patch.package.version
  );

const sha256 = async (filePath: string) =>
  createHash("sha256")
    .update(await fs.promises.readFile(filePath))
    .digest("hex");

/**
 * Installs per-game widescreen patches (see `WIDESCREEN_PATCHES`), keeps track
 * of what it installed and tells the launcher which DLL override a game needs
 * under Wine.
 */
export class WidescreenPatch {
  private static readonly inflight = new Map<string, Promise<string>>();

  private static async getGame(shop: GameShop, objectId: string) {
    const game = await gamesSublevel.get(levelKeys.game(shop, objectId));
    if (!game || game.isDeleted) {
      throw new WidescreenPatchError("not-found", "Game not found");
    }
    return game;
  }

  private static getInstallDirectory(game: Game, executablePath: string) {
    return game.widescreenPatch
      ? Promise.resolve(game.widescreenPatch.directory)
      : resolveOptiScalerInstallDirectory(executablePath);
  }

  /** The patch's unzipped folder, downloaded once and checked against its hash. */
  private static ensurePackage(patch: WidescreenPatchDefinition) {
    const directory = path.join(getCacheDirectory(patch), "files");
    const existing = this.inflight.get(patch.id);
    if (existing) return existing;
    const promise = (async () => {
      if (fs.existsSync(directory)) return directory;
      const archivePath = path.join(
        getCacheDirectory(patch),
        patch.package.fileName
      );
      const staging = `${directory}.partial`;
      try {
        await downloadToFile(patch.package.url, archivePath, () => undefined);
        if ((await sha256(archivePath)) !== patch.package.sha256) {
          throw new Error(`${patch.package.fileName} does not match its hash`);
        }
        await fs.promises.rm(staging, { recursive: true, force: true });
        const result = await SevenZip.extractFile({
          filePath: archivePath,
          outputPath: staging,
        });
        if (!result.success) {
          throw new Error(`Could not extract ${patch.package.fileName}`);
        }
        await fs.promises.rename(staging, directory);
        return directory;
      } finally {
        await fs.promises.rm(archivePath, { force: true });
        await fs.promises.rm(staging, { recursive: true, force: true });
      }
    })().finally(() => this.inflight.delete(patch.id));
    this.inflight.set(patch.id, promise);
    return promise;
  }

  public static async getGameStatus(
    shop: GameShop,
    objectId: string
  ): Promise<GameWidescreenPatchStatus> {
    const game = await this.getGame(shop, objectId);
    const definition = findWidescreenPatch(shop, objectId);
    const patch = definition
      ? {
          id: definition.id,
          name: definition.name,
          configFile: definition.configFile,
        }
      : null;
    const executablePath = getWindowsExecutable(game);
    if (!definition || !executablePath) {
      return {
        patch,
        installDirectory: null,
        installation: null,
        conflict: null,
        missingFiles: [],
      };
    }

    const installDirectory = await this.getInstallDirectory(
      game,
      executablePath
    );
    const manifest = await readWidescreenManifest(installDirectory);
    const installation =
      game.widescreenPatch && manifest ? game.widescreenPatch : null;
    const dllName = `${definition.nativeDll}.dll`;
    return {
      patch,
      installDirectory,
      installation,
      conflict:
        !manifest && (await findWidescreenConflict(installDirectory, dllName))
          ? { fileName: dllName }
          : null,
      missingFiles: manifest
        ? await findMissingWidescreenFiles(installDirectory, manifest)
        : [],
    };
  }

  public static async install(
    shop: GameShop,
    objectId: string
  ): Promise<GameWidescreenPatchInstallation> {
    const game = await this.getGame(shop, objectId);
    const patch = findWidescreenPatch(shop, objectId);
    if (!patch) {
      throw new WidescreenPatchError(
        "no-patch",
        "Hydra has no widescreen patch for this game"
      );
    }
    const executablePath = getWindowsExecutable(game);
    if (!executablePath) {
      throw new WidescreenPatchError(
        "not-windows-game",
        "The widescreen patch only works with Windows games"
      );
    }

    const installDirectory = await this.getInstallDirectory(
      game,
      executablePath
    );
    const dllName = `${patch.nativeDll}.dll`;
    if (await findWidescreenConflict(installDirectory, dllName)) {
      throw new WidescreenPatchError(
        "conflict",
        `${dllName} in the game folder belongs to the game or another tool`
      );
    }

    let directory: string;
    try {
      directory = await this.ensurePackage(patch);
    } catch (error) {
      logger.error("[WidescreenPatch] Failed to fetch the patch", {
        patch: patch.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new WidescreenPatchError(
        "download-failed",
        error instanceof Error ? error.message : String(error)
      );
    }
    const files = await planWidescreenFiles(directory, patch.archiveFolder);
    if (!files.some(({ target }) => target.toLowerCase() === dllName)) {
      throw new Error(`${patch.package.fileName} has no ${dllName}`);
    }

    const manifest = await installWidescreenPatch({
      patchId: patch.id,
      version: patch.package.version,
      installDirectory,
      files,
    });
    const installation: GameWidescreenPatchInstallation = {
      directory: installDirectory,
      patchId: patch.id,
      version: manifest.version,
      nativeDll: patch.nativeDll,
      installedAt: manifest.installedAt,
    };
    await updateGameRecord(levelKeys.game(shop, objectId), {
      widescreenPatch: installation,
    });
    logger.log("[WidescreenPatch] Installed", {
      game: `${shop}/${objectId}`,
      patch: patch.id,
      directory: installDirectory,
    });
    return installation;
  }

  public static async uninstall(shop: GameShop, objectId: string) {
    const game = await this.getGame(shop, objectId);
    const executablePath = getWindowsExecutable(game);
    const installDirectory = game.widescreenPatch
      ? game.widescreenPatch.directory
      : executablePath
        ? await resolveOptiScalerInstallDirectory(executablePath)
        : null;
    if (installDirectory) await uninstallWidescreenPatch(installDirectory);
    await updateGameRecord(levelKeys.game(shop, objectId), {
      widescreenPatch: null,
    });
  }

  /** The proxy DLL Wine must load before its own, or null when no patch is installed. */
  public static getLaunchNativeDll(game: Game | null | undefined) {
    if (!game?.widescreenPatch) return null;
    return fs.existsSync(
      path.join(game.widescreenPatch.directory, WIDESCREEN_MANIFEST_FILE)
    )
      ? game.widescreenPatch.nativeDll
      : null;
  }
}
