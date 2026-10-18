import { shell } from "electron";
import { levelKeys } from "@main/level";
import { GameUpdates } from "@main/services/game-updates";
import { SaveBackups } from "@main/services/save-backups";
import type { GameShop } from "@types";
import { registerEvent } from "../register-event";

const checkGameUpdates = () => GameUpdates.checkAll();

const isCheckingGameUpdates = () => GameUpdates.isChecking();

const dismissGameUpdate = (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string
) => GameUpdates.dismiss(levelKeys.game(shop, objectId));

const listSaveBackups = () => SaveBackups.list();

const getGameSaveBackups = (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string
) => SaveBackups.getForGame(shop, objectId);

const deleteGameSaveBackups = (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string
) => SaveBackups.delete(shop, objectId);

const pruneSaveBackups = () => SaveBackups.pruneAll();

const openGameSaveBackups = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string
) => {
  const backups = await SaveBackups.getForGame(shop, objectId);
  if (backups) await shell.openPath(backups.directory);
};

registerEvent("checkGameUpdates", checkGameUpdates);
registerEvent("isCheckingGameUpdates", isCheckingGameUpdates);
registerEvent("dismissGameUpdate", dismissGameUpdate);
registerEvent("listSaveBackups", listSaveBackups);
registerEvent("getGameSaveBackups", getGameSaveBackups);
registerEvent("deleteGameSaveBackups", deleteGameSaveBackups);
registerEvent("pruneSaveBackups", pruneSaveBackups);
registerEvent("openGameSaveBackups", openGameSaveBackups);
