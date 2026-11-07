import { shell } from "electron";

import { registerEvent } from "../register-event";
import { downloadsSublevel, levelKeys } from "@main/level";
import { findDownloadInstaller } from "@main/helpers/find-game-installer";
import type { GameShop } from "@types";

const showGameInstaller = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string
) => {
  const download = await downloadsSublevel.get(levelKeys.game(shop, objectId));
  const installerPath = await findDownloadInstaller(download).catch(() => null);

  if (installerPath) shell.showItemInFolder(installerPath);
};

registerEvent("showGameInstaller", showGameInstaller);
