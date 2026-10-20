import { levelKeys } from "@main/level";
import { updateGameRecord } from "@main/services/game-record-updater";
import { WindowManager } from "@main/services/window-manager";
import { PLAY_STATUSES } from "@shared";
import type { GameShop, PlayStatus } from "@types";

import { registerEvent } from "../register-event";

const setGamePlayStatus = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  playStatus: PlayStatus | null
) => {
  if (playStatus !== null && !PLAY_STATUSES.includes(playStatus)) {
    throw new Error(`Unknown play status: ${playStatus}`);
  }

  await updateGameRecord(levelKeys.game(shop, objectId), { playStatus });
  WindowManager.sendToAppWindows("on-library-batch-complete");
};

registerEvent("setGamePlayStatus", setGamePlayStatus);
