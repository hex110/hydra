import { registerEvent } from "../register-event";
import { downloadsSublevel, levelKeys } from "@main/level";
import { findDownloadInstaller } from "@main/helpers/find-game-installer";
import { isInnoSetupInstaller } from "@main/helpers/silent-installer";
import type { GameInstallerInfo, GameShop } from "@types";
import path from "node:path";

const getGameInstallerInfo = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string
): Promise<GameInstallerInfo | null> => {
  if (shop === "launchbox") return null;

  const download = await downloadsSublevel.get(levelKeys.game(shop, objectId));
  const installerPath = await findDownloadInstaller(download).catch(() => null);
  if (!installerPath) return null;

  return {
    path: installerPath,
    name: path.basename(installerPath),
    supportsUnattended:
      process.platform === "linux" &&
      (await isInnoSetupInstaller(installerPath)),
  };
};

registerEvent("getGameInstallerInfo", getGameInstallerInfo);
