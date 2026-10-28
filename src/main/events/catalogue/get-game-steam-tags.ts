import { getSteamTagsForGame } from "@main/services/steam-tags";
import { registerEvent } from "../register-event";

registerEvent(
  "getGameSteamTags",
  async (_event, shop: string, objectId: string) =>
    (await getSteamTagsForGame(shop, objectId)).tags
);
