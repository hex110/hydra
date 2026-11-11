import type { GameShop } from "@types";
import {
  getGameUninstallPlan,
  uninstallGameFolder,
} from "@main/services/game-uninstall";
import { registerEvent } from "../register-event";

registerEvent(
  "getGameUninstallPlan",
  (_event, shop: GameShop, objectId: string) =>
    getGameUninstallPlan(shop, objectId)
);

registerEvent(
  "uninstallGameFolder",
  (
    _event,
    shop: GameShop,
    objectId: string,
    confirmed: { folder: string; prefix: string | null }
  ) => uninstallGameFolder(shop, objectId, confirmed)
);
