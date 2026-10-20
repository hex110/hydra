import { getSteamNews } from "@main/services/steam-news";
import { registerEvent } from "../register-event";

registerEvent(
  "getGameNews",
  (_event, steamAppIds: string[], countPerApp?: number) =>
    getSteamNews(Array.isArray(steamAppIds) ? steamAppIds : [], countPerApp)
);
