import {
  fetchOwnedGames,
  getSteamGameHistory,
  getSteamHistorySyncStatus,
  previewSteamLibraryImport,
  setSteamPlaytimeAdditive,
  startSteamHistorySync,
  startSteamWishlistSync,
} from "@main/services/steam-history";

import { WindowManager } from "@main/services/window-manager";

import { registerEvent } from "../register-event";

registerEvent(
  "testSteamHistoryConnection",
  async (_event, apiKey: string, steamId: string) => {
    const games = await fetchOwnedGames({ apiKey, steamId });
    return { ownedGames: games.length };
  }
);
registerEvent("syncSteamHistory", () => startSteamHistorySync());
registerEvent("getSteamHistorySyncStatus", () => getSteamHistorySyncStatus());
registerEvent("getSteamGameHistory", (_event, appId: string) =>
  getSteamGameHistory(appId)
);
registerEvent("syncSteamWishlist", () => startSteamWishlistSync());
registerEvent("previewSteamLibraryImport", (_event, minMinutes: number) =>
  previewSteamLibraryImport(minMinutes)
);
registerEvent(
  "setGameSteamPlaytimeAdditive",
  async (_event, appId: string, additive: boolean) => {
    await setSteamPlaytimeAdditive(appId, additive);
    WindowManager.sendToAppWindows("on-library-batch-complete");
  }
);
