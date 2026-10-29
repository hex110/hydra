import { shell } from "electron";

import type { GameShop } from "@types";
import { GameRuns } from "@main/services/game-runs/game-runs";
import { registerEvent } from "../register-event";

const getGameRuns = (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string
) => GameRuns.list(shop, objectId);

const getGameRunSummary = (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  runId: string
) => GameRuns.getSummary(shop, objectId, runId);

const openGameRunFolder = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  runId?: string
) => {
  const directory = GameRuns.getDirectory(shop, objectId, runId);
  if (directory) await shell.openPath(directory);
};

registerEvent("getGameRuns", getGameRuns);
registerEvent("getGameRunSummary", getGameRunSummary);
registerEvent("openGameRunFolder", openGameRunFolder);
