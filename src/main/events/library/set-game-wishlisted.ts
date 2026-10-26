import { levelKeys } from "@main/level";
import { updateGameRecord } from "@main/services/game-record-updater";
import { queueFloppySync } from "@main/services/floppy";
import { WindowManager } from "@main/services/window-manager";
import type { GameShop } from "@types";

import { registerEvent } from "../register-event";

const setGameWishlisted = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  wishlisted: boolean
) => {
  await updateGameRecord(levelKeys.game(shop, objectId), { wishlisted });
  WindowManager.sendToAppWindows("on-library-batch-complete");
  if (wishlisted) queueFloppySync(shop, objectId, "wishlist");
};

registerEvent("setGameWishlisted", setGameWishlisted);
