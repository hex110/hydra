import { levelKeys } from "@main/level";
import { updateGameRecord } from "@main/services/game-record-updater";
import { WindowManager } from "@main/services/window-manager";
import type { GameShop } from "@types";

import { registerEvent } from "../register-event";

registerEvent(
  "dismissCompletionSuggestion",
  async (
    _event: Electron.IpcMainInvokeEvent,
    shop: GameShop,
    objectId: string
  ) => {
    await updateGameRecord(levelKeys.game(shop, objectId), {
      completionSuggestionDismissed: true,
    });
    WindowManager.sendToAppWindows("on-library-batch-complete");
  }
);
