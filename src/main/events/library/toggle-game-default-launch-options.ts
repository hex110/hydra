import { updateGameRecord } from "@main/services/game-record-updater";
import { gamesSublevel, levelKeys } from "@main/level";
import type { GameShop } from "@types";
import { registerEvent } from "../register-event";

const toggleGameDefaultLaunchOptions = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  ignoreDefaultLaunchOptions: boolean
) => {
  const gameKey = levelKeys.game(shop, objectId);
  const game = await gamesSublevel.get(gameKey);

  if (!game) return;

  await updateGameRecord(gameKey, {
    ignoreDefaultLaunchOptions,
  });
};

registerEvent("toggleGameDefaultLaunchOptions", toggleGameDefaultLaunchOptions);
