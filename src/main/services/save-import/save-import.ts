import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { db, gamesSublevel, levelKeys } from "@main/level";
import { logger } from "@main/services/logger";
import { UserNotLoggedInError } from "@shared";
import { SystemPath } from "@main/services/system-path";
import { WindowManager } from "@main/services/window-manager";
import { updateGameRecord } from "@main/services/game-record-updater";
import { parseAchievementFile } from "@main/services/achievements/parse-achievement-file";
import { mergeAchievements } from "@main/services/achievements/merge-achievements";
import { publishSavesFoundNotification } from "@main/services/notifications";
import type {
  Game,
  GameShop,
  ResolvedRestoreTarget,
  SaveImportError,
  RestoreManifestResponse,
  SaveImportBulkProgress,
  SaveImportOptions,
  SaveImportPreview,
  SaveImportResult,
  UnlockedAchievement,
  UserPreferences,
} from "@types";
import { getCloudSaveGameContext } from "../cloud-save/cloud-save-game-context";
import { resolveRestoreManifestTargets } from "../cloud-save/resolve-remote-snapshot-targets";
import { buildRestoreReplacements } from "../cloud-save/restore-replacements";
import { replaceRestoreTargets } from "../cloud-save/replace-restore-targets";
import {
  countImportableFiles,
  isNewerThanSource,
  pickBestPreview,
  toFileAction,
} from "./save-import-plan";
import {
  listSaveImportSources,
  type SaveImportSource,
  type SourceAchievementFile,
} from "./save-import-sources";

export class SaveImportFailure extends Error {
  constructor(
    public readonly code: SaveImportError,
    message: string
  ) {
    super(message);
  }
}

interface ImportPlan {
  source: SaveImportSource;
  game: Game;
  manifest: RestoreManifestResponse;
  actions: ResolvedRestoreTarget[];
  unmappedFiles: number;
  winePrefixPath: string | null;
  achievementFiles: SourceAchievementFile[];
  achievements: UnlockedAchievement[];
}

const loadPreferences = () =>
  db
    .get<string, UserPreferences | null>(levelKeys.userPreferences, {
      valueEncoding: "json",
    })
    .catch(() => null);

const isWindowsGameOnLinux = (game: Game) =>
  process.platform === "linux" && /\.exe"?$/i.test(game.executablePath ?? "");

const isAchievementFileNewer = async (
  file: SourceAchievementFile,
  winePrefixPath: string | null
) => {
  if (!winePrefixPath) return true;
  const [source, existing] = await Promise.all([
    fs.promises.stat(file.filePath),
    fs.promises
      .stat(path.join(winePrefixPath, file.prefixRelativePath))
      .catch(() => null),
  ]);
  return !existing || existing.mtimeMs < source.mtimeMs;
};

const getGame = async (shop: GameShop, objectId: string) => {
  const game = await gamesSublevel.get(levelKeys.game(shop, objectId));
  if (!game || game.isDeleted) {
    throw new SaveImportFailure("not-found", "Game not found");
  }
  if (!isWindowsGameOnLinux(game)) {
    throw new SaveImportFailure(
      "not-windows-game",
      "Saves are only imported for Windows games on Linux"
    );
  }
  return game;
};

/**
 * Imports saves and achievements from Windows installs (and, later, cloud
 * sources) into a game's Wine prefix. Discovery, path mapping and file
 * replacement reuse Hydra Cloud's snapshot and restore code, so every source
 * only has to describe a snapshot and provide its files.
 */
export class SaveImport {
  private static bulkRun: Promise<void> | null = null;

  public static async listSources() {
    return listSaveImportSources(await loadPreferences()).map(
      (source) => source.info
    );
  }

  private static async findSources(sourceId?: string) {
    const sources = listSaveImportSources(await loadPreferences()).filter(
      (source) => source.info.enabled
    );
    if (!sourceId) return sources;
    const source = sources.find((item) => item.info.id === sourceId);
    if (!source) {
      throw new SaveImportFailure("source-not-found", "Source not found");
    }
    return [source];
  }

  private static async plan(
    game: Game,
    source: SaveImportSource
  ): Promise<ImportPlan> {
    const snapshot = await source.discoverSaves(game);
    const manifest: RestoreManifestResponse = {
      snapshot: {
        shop: game.shop,
        objectId: game.objectId,
        id: `import:${source.info.id}`,
        version: 0,
      },
      customPathRawPaths: [],
      variants: snapshot.variants,
      files: snapshot.files,
    };

    const context = await getCloudSaveGameContext(game.objectId, game.shop);
    let actions: ResolvedRestoreTarget[] = [];
    let unmappedFiles = 0;

    if (snapshot.files.length > 0) {
      try {
        // Custom save paths belong to a Hydra account; imports have none,
        // and must work signed out.
        const plan = await resolveRestoreManifestTargets(
          manifest,
          context.pathContext,
          { ready: [], unresolved: [] }
        );
        actions = plan.actions;
        unmappedFiles = plan.blocked.length + plan.deferred.length;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.startsWith("cloud_save_restore_")) {
          throw new SaveImportFailure(
            "prefix-not-ready",
            "The game's Wine prefix does not exist yet"
          );
        }
        throw error;
      }
    }

    const winePrefixPath = context.pathContext.winePrefixPath ?? null;
    // Files the prefix already has at least as new were imported before.
    const achievementFiles: SourceAchievementFile[] = [];
    for (const file of await source.findAchievementFiles(game)) {
      if (await isAchievementFileNewer(file, winePrefixPath)) {
        achievementFiles.push(file);
      }
    }
    const achievements = achievementFiles.flatMap((file) =>
      parseAchievementFile(file.filePath, file.type)
    );

    return {
      source,
      game,
      manifest,
      actions,
      unmappedFiles,
      winePrefixPath,
      achievementFiles,
      achievements,
    };
  }

  private static toPreview(plan: ImportPlan): SaveImportPreview {
    const files = plan.actions.map((target) => ({
      rawPath: target.rawPath,
      relativePath: target.relativePath,
      sizeBytes: target.sizeBytes,
      lastModifiedAt: target.lastModifiedAt,
      action: toFileAction(target),
      targetPath: target.targetPath,
    }));
    const newest = files.reduce<string | null>(
      (latest, file) =>
        !latest || Date.parse(file.lastModifiedAt) > Date.parse(latest)
          ? file.lastModifiedAt
          : latest,
      null
    );

    return {
      sourceId: plan.source.info.id,
      sourceLabel: plan.source.info.label,
      files,
      unmappedFiles: plan.unmappedFiles,
      achievements: plan.achievements.length,
      newestFileAt: newest,
    };
  }

  /** What each enabled source would import for a game; sources with nothing are left out. */
  public static async preview(
    shop: GameShop,
    objectId: string,
    sourceId?: string
  ): Promise<SaveImportPreview[]> {
    const game = await getGame(shop, objectId);
    const previews: SaveImportPreview[] = [];

    for (const source of await this.findSources(sourceId)) {
      const preview = this.toPreview(await this.plan(game, source));
      if (preview.files.length > 0 || preview.achievements > 0) {
        previews.push(preview);
      }
    }

    return previews;
  }

  public static async apply(
    shop: GameShop,
    objectId: string,
    sourceId: string,
    options: SaveImportOptions = {}
  ): Promise<SaveImportResult> {
    const game = await getGame(shop, objectId);
    const [source] = await this.findSources(sourceId);
    const plan = await this.plan(game, source);

    const toWrite = plan.actions.filter(
      (target) =>
        target.action !== "skip-identical" &&
        (options.overwriteNewer || !isNewerThanSource(target))
    );
    const keptNewerFiles = plan.actions.filter(
      (target) => !options.overwriteNewer && isNewerThanSource(target)
    ).length;

    const stamp = new Date().toISOString().replaceAll(":", "-");
    const backupRoot = path.join(
      SystemPath.getPath("userData"),
      "save-import",
      "backups",
      `${shop}-${objectId}`,
      stamp
    );
    let backedUp = 0;
    const tempDirectory = path.join(
      SystemPath.getPath("temp"),
      `hydra-save-import-${randomUUID()}`
    );

    let importedFiles = 0;
    let failedFiles = 0;

    try {
      if (toWrite.length > 0) {
        await fs.promises.mkdir(tempDirectory, { recursive: true });

        // Files the import replaces are kept, laid out like the prefix.
        for (const target of toWrite) {
          if (target.action !== "replace") continue;
          const relative = plan.winePrefixPath
            ? path.relative(plan.winePrefixPath, target.targetPath)
            : target.targetPath.replace(/^\/+/, "");
          const backupPath = path.join(backupRoot, relative);
          await fs.promises.mkdir(path.dirname(backupPath), {
            recursive: true,
          });
          await fs.promises.copyFile(target.targetPath, backupPath);
          backedUp += 1;
        }

        const downloaded = await Promise.all(
          toWrite.map(async (target) => {
            const file = plan.manifest.files.find(
              (item) =>
                item.variantId === target.variantId &&
                item.rawPath === target.rawPath &&
                item.relativePath === target.relativePath
            )!;
            return {
              ...file,
              tempPath: await source.stageFile(file, tempDirectory),
            };
          })
        );

        const result = await replaceRestoreTargets(
          buildRestoreReplacements(toWrite, downloaded)
        );
        importedFiles = result.restoredFiles.length;
        failedFiles = result.failedFiles.length;
      }

      let achievements = 0;
      if (options.includeAchievements !== false) {
        achievements = await this.importAchievements(plan);
      }

      await updateGameRecord(levelKeys.game(shop, objectId), (current) => ({
        saveImport: {
          ...current.saveImport,
          pending: null,
          lastImport: {
            sourceId,
            at: new Date().toISOString(),
            files: importedFiles,
            achievements,
          },
        },
      }));

      logger.info("[SaveImport] Imported", {
        game: game.title,
        source: sourceId,
        importedFiles,
        keptNewerFiles,
        failedFiles,
        achievements,
      });

      return {
        sourceId,
        importedFiles,
        keptNewerFiles,
        failedFiles,
        achievements,
        backupPath: backedUp > 0 ? backupRoot : null,
      };
    } catch (error) {
      if (error instanceof SaveImportFailure) throw error;
      logger.error("[SaveImport] Import failed", { game: game.title, error });
      throw new SaveImportFailure(
        "failed",
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      await fs.promises
        .rm(tempDirectory, { recursive: true, force: true })
        .catch(() => undefined);
    }
  }

  /**
   * Merges the emulator's unlocked achievements into Hydra and copies its
   * achievement files into the prefix, so the emulator agrees with Hydra.
   */
  private static async importAchievements(plan: ImportPlan) {
    if (plan.winePrefixPath) {
      for (const file of plan.achievementFiles) {
        const target = path.join(plan.winePrefixPath, file.prefixRelativePath);
        const source = await fs.promises.stat(file.filePath);
        await fs.promises.mkdir(path.dirname(target), { recursive: true });
        await fs.promises.copyFile(file.filePath, target);
        await fs.promises.utimes(target, source.atime, source.mtime);
      }
    }

    if (plan.achievements.length === 0) return 0;
    const game = await gamesSublevel.get(
      levelKeys.game(plan.game.shop, plan.game.objectId)
    );
    if (!game) return 0;
    // Merging needs the achievement catalogue, which Hydra only gets signed
    // in. The files are in the prefix by now, so the achievement watcher
    // picks them up after signing in.
    try {
      await mergeAchievements(game, plan.achievements, false);
    } catch (error) {
      if (!(error instanceof UserNotLoggedInError)) throw error;
      logger.info(
        "[SaveImport] Achievement files copied; merge needs sign-in",
        {
          game: game.title,
        }
      );
    }
    return plan.achievements.length;
  }

  /**
   * Looks for saves of a newly set up game and, depending on the import mode,
   * imports them or remembers them for the user to confirm.
   */
  public static async checkNewGame(shop: GameShop, objectId: string) {
    const preferences = await loadPreferences();
    const mode = preferences?.saveImportMode ?? "ask";
    if (mode === "never") return;

    const game = await gamesSublevel.get(levelKeys.game(shop, objectId));
    if (!game || !isWindowsGameOnLinux(game)) return;
    if (game.saveImport?.lastImport || game.saveImport?.dismissedAt) return;

    const best = pickBestPreview(await this.preview(shop, objectId));
    if (!best) return;

    if (mode === "automatic") {
      await this.apply(shop, objectId, best.sourceId);
      return;
    }

    await updateGameRecord(levelKeys.game(shop, objectId), (current) => ({
      saveImport: {
        lastImport: null,
        ...current.saveImport,
        pending: {
          sourceId: best.sourceId,
          sourceLabel: best.sourceLabel,
          files: countImportableFiles(best),
          achievements: best.achievements,
          newestFileAt: best.newestFileAt,
        },
      },
    }));
    await publishSavesFoundNotification(game, {
      files: countImportableFiles(best),
      achievements: best.achievements,
      sourceLabel: best.sourceLabel,
    }).catch((error) =>
      logger.warn("[SaveImport] Could not publish notification", error)
    );
    WindowManager.sendToAppWindows("on-save-import-found", {
      shop,
      objectId,
      title: game.title,
    });
  }

  public static async dismissPending(shop: GameShop, objectId: string) {
    await updateGameRecord(levelKeys.game(shop, objectId), (current) => ({
      saveImport: {
        lastImport: null,
        ...current.saveImport,
        pending: null,
        dismissedAt: new Date().toISOString(),
      },
    }));
  }

  private static sendBulkProgress(progress: SaveImportBulkProgress) {
    WindowManager.sendToAppWindows("on-save-import-bulk-progress", progress);
  }

  /**
   * Imports saves for every Windows game in the library from the first source
   * that has any, never replacing newer files. Returns false when a run is
   * already in progress.
   */
  public static runBulk() {
    if (this.bulkRun) return false;
    this.bulkRun = this.bulk()
      .catch((error) => logger.error("[SaveImport] Bulk import failed", error))
      .finally(() => {
        this.bulkRun = null;
        WindowManager.sendToAppWindows("on-library-batch-complete");
      });
    return true;
  }

  private static async bulk() {
    const games = (await gamesSublevel.values().all()).filter(
      (game) => !game.isDeleted && isWindowsGameOnLinux(game)
    );
    const progress: SaveImportBulkProgress = {
      status: "running",
      processed: 0,
      total: games.length,
      importedGames: 0,
      failedGames: 0,
    };
    this.sendBulkProgress(progress);

    for (const game of games) {
      try {
        const best = pickBestPreview(
          await this.preview(game.shop, game.objectId)
        );
        if (best) {
          await this.apply(game.shop, game.objectId, best.sourceId);
          progress.importedGames += 1;
        }
      } catch (error) {
        if (
          !(error instanceof SaveImportFailure) ||
          error.code !== "prefix-not-ready"
        ) {
          progress.failedGames += 1;
        }
        logger.warn("[SaveImport] Bulk import skipped a game", {
          title: game.title,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      progress.processed += 1;
      this.sendBulkProgress(progress);
    }

    this.sendBulkProgress({ ...progress, status: "completed" });
  }
}
