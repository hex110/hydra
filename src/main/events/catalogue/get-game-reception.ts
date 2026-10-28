import { getSteamReception } from "@main/services/steam-reception";
import { registerEvent } from "../register-event";

registerEvent("getGameReception", (_event, steamAppId: string) =>
  getSteamReception(String(steamAppId))
);
