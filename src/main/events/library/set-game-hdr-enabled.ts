import { updateGameRecord } from "@main/services/game-record-updater";
import { levelKeys } from "@main/level";
import type { GameShop } from "@types";
import { registerEvent } from "../register-event";

/** Null makes the game follow the global HDR preference again. */
const setGameHdrEnabled = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  enabled: boolean | null
) => {
  await updateGameRecord(levelKeys.game(shop, objectId), {
    hdrEnabled: enabled,
  });
};

registerEvent("setGameHdrEnabled", setGameHdrEnabled);
