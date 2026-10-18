import fs from "node:fs";
import { gamesSublevel, levelKeys } from "@main/level";
import { parseExecutablePath } from "@main/events/helpers/parse-executable-path";
import type { Game } from "@types";
import { isExecutableMissingFromAvailableStorage } from "./executable-availability-core";
import { updateGameRecord } from "./game-record-updater";
import { logger } from "./logger";
import { WindowManager } from "./window-manager";

const STARTUP_DELAY_MS = 20_000;

/**
 * "missing" when the executable is gone from a drive that is there,
 * "offline" when the drive or share holding it is not mounted.
 */
export const getExecutableStatus = async (
  executablePath: string
): Promise<Game["executableStatus"]> => {
  const parsed = parseExecutablePath(executablePath);
  if (fs.existsSync(parsed)) return null;
  return (await isExecutableMissingFromAvailableStorage(parsed))
    ? "missing"
    : "offline";
};

const isChecked = (game: Game) =>
  !game.isDeleted &&
  !!game.executablePath &&
  game.shop !== "launchbox" &&
  !game.epicInstallation;

/** Updates a game's stored status; returns true when it changed. */
export const refreshExecutableStatus = async (game: Game) => {
  if (!isChecked(game)) return false;
  const status = await getExecutableStatus(game.executablePath!);
  if ((game.executableStatus ?? null) === status) return false;

  await updateGameRecord(levelKeys.game(game.shop, game.objectId), {
    executableStatus: status,
  });
  logger.info("[ExecutableStatus] Changed", {
    game: game.title,
    status,
    executablePath: game.executablePath,
  });
  return true;
};

export const refreshAllExecutableStatuses = async () => {
  let changed = false;
  for (const game of await gamesSublevel.values().all()) {
    try {
      changed = (await refreshExecutableStatus(game)) || changed;
    } catch (error) {
      logger.warn("[ExecutableStatus] Check failed", {
        game: game.title,
        error,
      });
    }
  }
  if (changed) WindowManager.sendToAppWindows("on-library-batch-complete");
};

export const scheduleExecutableStatusCheck = () => {
  setTimeout(() => void refreshAllExecutableStatuses(), STARTUP_DELAY_MS);
};
