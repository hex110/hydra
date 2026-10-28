import { getSteamSimilarGames } from "@main/services/steam-similar";
import { registerEvent } from "../register-event";

registerEvent("getSteamSimilarGames", (_event, steamAppId: string) =>
  getSteamSimilarGames(String(steamAppId))
);
