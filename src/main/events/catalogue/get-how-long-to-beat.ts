import type { GameShop } from "@types";
import { getHowLongToBeat } from "@main/services/how-long-to-beat";
import { registerEvent } from "../register-event";

registerEvent(
  "getHowLongToBeat",
  async (_event, shop: GameShop, objectId: string, title: string) =>
    (await getHowLongToBeat(shop, objectId, title)) ?? null
);
