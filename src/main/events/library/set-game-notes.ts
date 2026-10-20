import { levelKeys } from "@main/level";
import { updateGameRecord } from "@main/services/game-record-updater";
import { WindowManager } from "@main/services/window-manager";
import type { GameShop } from "@types";

import { registerEvent } from "../register-event";

const MAX_GAME_NOTES_LENGTH = 10_000;

const setGameNotes = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  notes: string
) => {
  const trimmed = notes.slice(0, MAX_GAME_NOTES_LENGTH);
  await updateGameRecord(levelKeys.game(shop, objectId), {
    notes: trimmed.trim() ? trimmed : null,
  });
  WindowManager.sendToAppWindows("on-library-batch-complete");
};

registerEvent("setGameNotes", setGameNotes);
