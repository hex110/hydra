import { registerEvent } from "../register-event";
import { WindowManager } from "@main/services";
import { sendGameLauncherStatus } from "@main/services/game-launcher-status";
import { levelKeys } from "@main/level";
import type { GameShop } from "@types";
import { closeGame } from "./close-game";

const cancelGameLaunch = async (
  event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string
) => {
  await closeGame(event, shop, objectId);
  sendGameLauncherStatus(levelKeys.game(shop, objectId), "launch_cancelled");
  WindowManager.closeGameLauncherWindow();
};

registerEvent("cancelGameLaunch", cancelGameLaunch);
