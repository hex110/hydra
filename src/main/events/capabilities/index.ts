import type { GameCapabilityId, GameCapabilityMode, GameShop } from "@types";
import {
  getCompatibilityOverview,
  getGameCapabilities,
  setGameCapabilityMode,
} from "@main/services/capabilities/game-capabilities";
import { registerEvent } from "../register-event";

registerEvent(
  "getGameCapabilities",
  (_event: Electron.IpcMainInvokeEvent, shop: GameShop, objectId: string) =>
    getGameCapabilities(shop, objectId)
);

registerEvent(
  "setGameCapabilityMode",
  (
    _event: Electron.IpcMainInvokeEvent,
    shop: GameShop,
    objectId: string,
    id: GameCapabilityId,
    mode: GameCapabilityMode
  ) => setGameCapabilityMode(shop, objectId, id, mode)
);

registerEvent("getCompatibilityOverview", () => getCompatibilityOverview());
