import { gamesSublevel } from "@main/level";
import type {
  Game,
  ManualSaveBackupScope,
  ManualSaveBackupSummary,
} from "@types";

import { isGameRunning } from "../game-running-state";
import { logger } from "../logger";
import { WindowManager } from "../window-manager";
import { canRunAutomaticCloudSaveSync } from "./automatic-sync";
import { getCloudSaveErrorDetails } from "./cloud-save-error-details";
import { mapWithConcurrency } from "./map-with-concurrency";
import { selectGamesForBackup } from "./manual-backup-scope";
import { syncGameCloudSave } from "./sync-game-cloud-save";

const CONCURRENCY = 2;

let running: Promise<ManualSaveBackupSummary> | null = null;
let cancelRequested = false;

const readLibraryGames = async () => {
  const games: Game[] = [];
  for await (const [, game] of gamesSublevel.iterator()) games.push(game);
  return games;
};

export const countManualSaveBackupGames = async (
  scope: ManualSaveBackupScope
) => selectGamesForBackup(await readLibraryGames(), scope).length;

export const isManualSaveBackupRunning = () => running !== null;

export const cancelManualSaveBackup = () => {
  cancelRequested = true;
};

const run = async (
  scope: ManualSaveBackupScope
): Promise<ManualSaveBackupSummary> => {
  const games = selectGamesForBackup(await readLibraryGames(), scope);
  const summary: ManualSaveBackupSummary = {
    total: games.length,
    uploaded: 0,
    restored: 0,
    unchanged: 0,
    skipped: 0,
    failed: 0,
    conflicts: [],
    cancelled: false,
  };

  let done = 0;
  const report = (title: string | null) =>
    WindowManager.sendToAppWindows("on-manual-save-backup-progress", {
      done,
      total: games.length,
      title,
    });
  report(null);

  await mapWithConcurrency(games, CONCURRENCY, async (game) => {
    if (cancelRequested) {
      summary.cancelled = true;
      return;
    }

    report(game.title);
    try {
      if (
        isGameRunning(game.objectId, game.shop) ||
        !(await canRunAutomaticCloudSaveSync(game.objectId, game.shop))
      ) {
        summary.skipped += 1;
        return;
      }

      const result = await syncGameCloudSave(
        game.objectId,
        game.shop,
        "manual"
      );
      if (result.action === "conflict") {
        summary.conflicts.push({
          shop: game.shop,
          objectId: game.objectId,
          title: game.title,
        });
      } else if (result.action === "upload") {
        summary.uploaded += 1;
      } else if (result.action === "restore" || result.action === "merge") {
        summary.restored += 1;
      } else {
        summary.unchanged += 1;
      }
    } catch (error) {
      summary.failed += 1;
      logger.warn("[Cloud Save] Manual backup failed for a game", {
        shop: game.shop,
        objectId: game.objectId,
        ...getCloudSaveErrorDetails(error),
      });
    } finally {
      done += 1;
      report(null);
    }
  });

  return summary;
};

/** One backup at a time; asking again while one runs joins it. */
export const runManualSaveBackup = (scope: ManualSaveBackupScope) => {
  if (running) return running;

  cancelRequested = false;
  running = run(scope).finally(() => {
    running = null;
  });
  return running;
};
