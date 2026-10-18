import {
  db,
  downloadSourcesSublevel,
  downloadsSublevel,
  gamesSublevel,
  levelKeys,
} from "@main/level";
import { HydraApi } from "@main/services/hydra-api";
import { LocalSources } from "@main/services/local-sources/local-sources";
import { updateGameRecord } from "@main/services/game-record-updater";
import { logger } from "@main/services/logger";
import { WindowManager } from "@main/services/window-manager";
import { publishGameUpdatesNotification } from "@main/services/notifications";
import {
  filterDownloadableRepacks,
  findAvailableUpdate,
  mergeLocalRepacks,
  toDownloadRelease,
} from "@shared";
import type {
  Game,
  GameRepack,
  GameUpdateCheckResult,
  UserPreferences,
} from "@types";
import { ensureInstalledVersion } from "./installed-version";

const CONCURRENCY = 4;

const canUpdate = (game: Game) =>
  !game.isDeleted &&
  !!game.executablePath &&
  !game.hasActiveSteamImport &&
  !game.epicInstallation &&
  game.shop !== "launchbox" &&
  !/[\\/]steamapps[\\/]common[\\/]/i.test(game.executablePath);

/**
 * Looks for newer releases of installed games in the download sources, the
 * same lists the game page shows: the server's matches plus Hydra's local
 * copy of each source.
 */
export class GameUpdates {
  private static running: Promise<GameUpdateCheckResult> | null = null;

  public static isChecking() {
    return this.running !== null;
  }

  private static async findRepacks(game: Game, sourceIds: string[]) {
    const catalogue = game.catalogueGame ?? {
      shop: game.shop,
      objectId: game.objectId,
    };

    const [server, local] = await Promise.all([
      catalogue.shop === "custom" || sourceIds.length === 0
        ? Promise.resolve([] as GameRepack[])
        : HydraApi.get<GameRepack[]>(
            `/games/${catalogue.shop}/${catalogue.objectId}/download-sources`,
            { take: 100, skip: 0, downloadSourceIds: sourceIds },
            { needsAuth: false }
          ).catch((error) => {
            logger.warn("[GameUpdates] Could not list downloads", {
              game: game.title,
              error: error instanceof Error ? error.message : String(error),
            });
            return [] as GameRepack[];
          }),
      LocalSources.findRepacks(game.title).catch(() => [] as GameRepack[]),
    ]);

    return filterDownloadableRepacks(
      mergeLocalRepacks(Array.isArray(server) ? server : [], local)
    );
  }

  /** Re-checks one game and stores what it found. */
  public static async checkGame(gameKey: string, sourceIds?: string[]) {
    await ensureInstalledVersion(gameKey).catch((error) =>
      logger.warn("[GameUpdates] Could not record installed version", {
        gameKey,
        error,
      })
    );

    const game = await gamesSublevel.get(gameKey);
    if (!game || !canUpdate(game) || !game.installedVersion) {
      if (game?.availableUpdate) {
        await updateGameRecord(gameKey, { availableUpdate: null });
      }
      return null;
    }

    // An update already downloading is not offered again.
    const download = await downloadsSublevel.get(gameKey);
    if (download?.update && download.status !== "complete") return null;

    const ids =
      sourceIds ??
      (await downloadSourcesSublevel.values().all()).map((source) => source.id);
    const repacks = await this.findRepacks(game, ids);
    const update = findAvailableUpdate(
      repacks,
      game.installedVersion,
      game.title,
      game.dismissedUpdateTitles ?? []
    );

    const release = update ? toDownloadRelease(update) : null;
    const previous = game.availableUpdate?.release.title ?? null;

    if ((release?.title ?? null) !== previous) {
      await updateGameRecord(gameKey, {
        availableUpdate: release
          ? { release, detectedAt: new Date().toISOString() }
          : null,
      });
    }

    return release && release.title !== previous ? release : null;
  }

  public static checkAll(): Promise<GameUpdateCheckResult> {
    this.running ??= this.runCheckAll().finally(() => {
      this.running = null;
      WindowManager.sendToAppWindows("on-game-updates-checked");
    });
    WindowManager.sendToAppWindows("on-game-updates-checking");
    return this.running;
  }

  private static async runCheckAll(): Promise<GameUpdateCheckResult> {
    const sourceIds = (await downloadSourcesSublevel.values().all()).map(
      (source) => source.id
    );
    const games = (await gamesSublevel.values().all()).filter(canUpdate);
    const newlyFound: Game[] = [];
    let index = 0;

    const worker = async () => {
      while (index < games.length) {
        const game = games[index++];
        const gameKey = levelKeys.game(game.shop, game.objectId);
        try {
          if (await this.checkGame(gameKey, sourceIds)) newlyFound.push(game);
        } catch (error) {
          logger.error("[GameUpdates] Check failed", { gameKey, error });
        }
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    const withUpdates = (await gamesSublevel.values().all()).filter(
      (game) => canUpdate(game) && game.availableUpdate
    ).length;

    logger.info("[GameUpdates] Checked installed games", {
      checked: games.length,
      withUpdates,
      newlyFound: newlyFound.length,
    });

    WindowManager.sendToAppWindows("on-library-batch-complete");
    if (newlyFound.length > 0) {
      void publishGameUpdatesNotification(newlyFound);
    }

    return {
      checked: games.length,
      updates: withUpdates,
      checkedAt: new Date().toISOString(),
    };
  }

  /** The automatic checks after startup and source syncs, unless turned off. */
  public static async checkAllIfEnabled() {
    const preferences = await db
      .get<string, UserPreferences | null>(levelKeys.userPreferences, {
        valueEncoding: "json",
      })
      .catch(() => null);
    if (preferences?.checkGameUpdates === false) return null;
    return this.checkAll();
  }

  public static async dismiss(gameKey: string) {
    await updateGameRecord(gameKey, (game) => ({
      availableUpdate: null,
      dismissedUpdateTitles: game.availableUpdate
        ? [
            ...(game.dismissedUpdateTitles ?? []),
            game.availableUpdate.release.title,
          ]
        : game.dismissedUpdateTitles,
    }));
    WindowManager.sendToAppWindows("on-library-batch-complete");
  }
}
