import path from "node:path";
import type { Game } from "@types";
import { downloadsSublevel, levelKeys } from "@main/level";
import { getSteamLibraryFolders } from "./steam";
import { updateGameRecord } from "./game-record-updater";
import { logger } from "./logger";
import { isExecutableMissingFromAvailableStorage } from "./executable-availability-core";
import {
  isPathInsideSteamInstallDirectory,
  isStaleSteamLibraryExecutable,
} from "./steam-integration/steam-installation-core";

const isInsideSteamLibrary = (
  executablePath: string,
  libraryFolders: string[]
) =>
  libraryFolders.some((folder) =>
    isPathInsideSteamInstallDirectory(
      executablePath,
      path.join(folder, "steamapps", "common")
    )
  );

const isExecutableGone = (executablePath: string, libraryFolders: string[]) =>
  isInsideSteamLibrary(executablePath, libraryFolders)
    ? isStaleSteamLibraryExecutable(executablePath, libraryFolders)
    : isExecutableMissingFromAvailableStorage(executablePath);

/**
 * A game whose files are being extracted or replaced by an update is not
 * uninstalled when its executable is briefly missing; the extraction (or its
 * retry) brings the files back.
 */
const isBeingReplaced = async (game: Game) => {
  const download = await downloadsSublevel
    .get(levelKeys.game(game.shop, game.objectId))
    .catch(() => null);
  return Boolean(download?.extracting || download?.update);
};

export const clearMissingExecutables = async (
  games: Game[]
): Promise<Game[]> => {
  const candidates = games.filter(
    (game) =>
      game.isDeleted !== true &&
      game.shop !== "custom" &&
      game.shop !== "launchbox" &&
      Boolean(game.executablePath)
  );
  if (candidates.length === 0) return [];

  const libraryFolders = await getSteamLibraryFolders().catch(() => []);
  const clearedGames: Game[] = [];

  for (const game of candidates) {
    const executablePath = game.executablePath!;
    if (!(await isExecutableGone(executablePath, libraryFolders))) continue;
    if (await isBeingReplaced(game)) continue;

    let didClear = false;
    const updatedGame = await updateGameRecord(
      levelKeys.game(game.shop, game.objectId),
      (current) => {
        if (current.executablePath !== executablePath) return {};

        didClear = true;
        return {
          executablePath: null,
          executablePathUpdatedAt: null,
          installedSizeInBytes: null,
        };
      }
    );

    if (!didClear || !updatedGame) continue;

    logger.info(
      `[ClearMissingExecutables] Cleared missing executable for ${game.shop}:${game.objectId}: ${executablePath}`
    );
    clearedGames.push(updatedGame);
  }

  return clearedGames;
};
