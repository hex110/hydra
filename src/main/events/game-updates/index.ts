import path from "node:path";
import { shell } from "electron";
import { gamesSublevel, levelKeys } from "@main/level";
import { toolOverlaysForGame } from "@main/services/game-updates/tool-overlays";
import { ModStore } from "@main/services/mods/mod-store";
import { GameUpdates } from "@main/services/game-updates";
import { SaveBackups } from "@main/services/save-backups";
import type { GameShop, GameUpdateAddOns } from "@types";
import { registerEvent } from "../register-event";

const checkGameUpdates = () => GameUpdates.checkAll();

const isCheckingGameUpdates = () => GameUpdates.isChecking();

const getGameUpdatesCheckedAt = () => GameUpdates.getLastCheckedAt();

const dismissGameUpdate = (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string
) => GameUpdates.dismiss(levelKeys.game(shop, objectId));

const getGameUpdateAddOns = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string
): Promise<GameUpdateAddOns> => {
  const [game, mods] = await Promise.all([
    gamesSublevel.get(levelKeys.game(shop, objectId)),
    ModStore.readState(shop, objectId).catch(() => null),
  ]);
  const installDirectory = game?.installedVersion?.directory ?? null;
  return {
    mods: mods?.mods.filter((mod) => mod.enabled).length ?? 0,
    // Without a recorded folder, every tool the game has is counted.
    tools: game
      ? toolOverlaysForGame(
          game,
          installDirectory ?? path.parse(process.cwd()).root
        ).map(({ tool }) => tool)
      : [],
  };
};

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
registerEvent("getGameUpdatesCheckedAt", getGameUpdatesCheckedAt);
registerEvent("dismissGameUpdate", dismissGameUpdate);
registerEvent("getGameUpdateAddOns", getGameUpdateAddOns);
registerEvent("listSaveBackups", listSaveBackups);
registerEvent("getGameSaveBackups", getGameSaveBackups);
registerEvent("deleteGameSaveBackups", deleteGameSaveBackups);
registerEvent("pruneSaveBackups", pruneSaveBackups);
registerEvent("openGameSaveBackups", openGameSaveBackups);
