import { shell } from "electron";
import { registerEvent } from "../register-event";
import { GameShop } from "@types";
import { downloadsSublevel, levelKeys } from "@main/level";
import { resolveDownloadFolder } from "@main/services/download-game-folder";

const openGameInstallerPath = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string
) => {
  const download = await downloadsSublevel.get(levelKeys.game(shop, objectId));

  if (!download?.folderName || !download.downloadPath) return;

  const folder = resolveDownloadFolder(download);

  if (folder.kind === "folder") shell.openPath(folder.folderPath);
  else if (folder.kind === "archive")
    shell.showItemInFolder(folder.archivePath);
  else if (folder.kind === "file") shell.showItemInFolder(folder.filePath);
};

registerEvent("openGameInstallerPath", openGameInstallerPath);
