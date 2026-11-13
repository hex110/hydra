import { shell } from "electron";
import { gamesSublevel, levelKeys } from "@main/level";
import { updateGameRecord } from "../game-record-updater";
import { steamSyncLogger } from "../logger";
import type { Game, GameSteamUpdate, SteamUpdateResult } from "@types";
import { findSteamUpdate } from "./steam-manifest-core";
import { findSteamManifest } from "./steam-manifest";
import {
  getInstalledSteamApps,
  loadSteamAppInfo,
} from "./steam-launch-executables";
import { SteamDownloads } from "./steam-downloads";
import { SteamStateService } from "./steam-state";

const STEAM_START_TIMEOUT_MS = 60_000;
// Steam takes a moment after starting before it handles steam:// URLs.
const STEAM_SETTLE_MS = 8_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isSteamLibraryGame = (game: Game) =>
  game.shop === "steam" && !game.isDeleted && !!game.executablePath;

/**
 * Compares every game installed through Steam with the builds Steam knows of
 * and records, on the game, the ones that are behind. Needs no network: the
 * manifest says what is installed, appinfo what each branch has. Returns the
 * games that have a build they did not have before.
 */
export const checkSteamGameUpdates = async (): Promise<Game[]> => {
  const [installed, games] = await Promise.all([
    getInstalledSteamApps(),
    gamesSublevel.values().all(),
  ]);
  const installedIds = new Set(installed.map((app) => app.appId));
  const candidates = games.filter(
    (game) => isSteamLibraryGame(game) && installedIds.has(game.objectId)
  );
  const appInfos = await loadSteamAppInfo(
    candidates.map((game) => game.objectId)
  );
  const inProgress = new Set(SteamDownloads.list().map((item) => item.appId));
  const newlyFound: Game[] = [];

  for (const game of games) {
    if (game.shop !== "steam") continue;

    const gameKey = levelKeys.game(game.shop, game.objectId);
    const candidate = candidates.includes(game);
    let next: GameSteamUpdate | null = null;

    if (candidate) {
      const manifest = await findSteamManifest(game.objectId);
      const update = manifest
        ? findSteamUpdate(
            manifest.state,
            appInfos.get(game.objectId)?.branches ?? []
          )
        : null;

      if (
        update &&
        !(
          update.availableBuildId &&
          game.dismissedSteamBuildIds?.includes(update.availableBuildId)
        )
      ) {
        next = {
          ...update,
          detectedAt:
            game.steamUpdate?.availableBuildId === update.availableBuildId
              ? game.steamUpdate.detectedAt
              : new Date().toISOString(),
        };
      }
    }

    if (
      (next?.availableBuildId ?? null) ===
        (game.steamUpdate?.availableBuildId ?? null) &&
      (next?.branch ?? null) === (game.steamUpdate?.branch ?? null) &&
      (next?.installedBuildId ?? null) ===
        (game.steamUpdate?.installedBuildId ?? null)
    ) {
      continue;
    }

    await updateGameRecord(gameKey, { steamUpdate: next });
    // Steam is already fetching it: listed, but not worth a notification.
    if (next && !inProgress.has(game.objectId)) newlyFound.push(game);
  }

  steamSyncLogger.log("Checked Steam games for updates", {
    checked: candidates.length,
    newlyFound: newlyFound.length,
  });

  return newlyFound;
};

export const dismissSteamUpdate = (gameKey: string) =>
  updateGameRecord(gameKey, (game) => ({
    steamUpdate: null,
    dismissedSteamBuildIds: game.steamUpdate?.availableBuildId
      ? [
          ...(game.dismissedSteamBuildIds ?? []),
          game.steamUpdate.availableBuildId,
        ]
      : game.dismissedSteamBuildIds,
  }));

/**
 * Has Steam fetch what a game is missing. Steam does the download, so Steam
 * must be open: `steam://validate/<id>` makes it compare the game's files with
 * the branch it follows and download the difference, which includes a pending
 * update. With `startSteam`, Hydra starts Steam first and waits for it.
 */
export const updateSteamGame = async (
  appId: string,
  startSteam: boolean
): Promise<SteamUpdateResult> => {
  const state = await SteamStateService.refresh();
  if (!state.installed) return "steam-not-installed";

  if (!state.running) {
    if (!startSteam) return "steam-not-running";

    await SteamStateService.open();
    if (!(await SteamStateService.waitFor(true, STEAM_START_TIMEOUT_MS))) {
      return "steam-start-failed";
    }
    await sleep(STEAM_SETTLE_MS);
  }

  await shell.openExternal(`steam://validate/${appId}`);
  return "started";
};
