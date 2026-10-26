import { levelKeys } from "@main/level";
import { updateGameRecord } from "@main/services/game-record-updater";
import { queueFloppySync } from "@main/services/floppy";
import { WindowManager } from "@main/services/window-manager";
import type { GameShop } from "@types";

import { registerEvent } from "../register-event";

const setGameRating = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  rating: number | null
) => {
  if (
    rating !== null &&
    !(Number.isInteger(rating) && rating >= 1 && rating <= 10)
  ) {
    throw new Error(`Invalid rating: ${rating}`);
  }

  await updateGameRecord(levelKeys.game(shop, objectId), { rating });
  WindowManager.sendToAppWindows("on-library-batch-complete");
  queueFloppySync(shop, objectId, "rating");
};

registerEvent("setGameRating", setGameRating);
