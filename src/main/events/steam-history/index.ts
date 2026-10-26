import {
  fetchOwnedGames,
  getSteamGameHistory,
  getSteamHistorySyncStatus,
  startSteamHistorySync,
} from "@main/services/steam-history";

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
