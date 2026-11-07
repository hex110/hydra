import { registerEvent } from "../register-event";
import { DownloadManager, DownloadOrchestrator } from "@main/services";
import { chooseAnkerGamesArchive } from "@main/services/ankergames";
import { downloadsSublevel, levelKeys } from "@main/level";
import { Downloader, DownloadError } from "@shared";
import type { GameShop } from "@types";

/** Hands an AnkerGames download the archive the person picked themselves. */
const useAnkerGamesArchive = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  filePath: string
) => {
  const key = levelKeys.game(shop, objectId);
  const download = await downloadsSublevel.get(key).catch(() => null);
  if (download?.downloader !== Downloader.AnkerGames) {
    throw new Error(DownloadError.AnkerGamesUnavailable);
  }

  await chooseAnkerGamesArchive(download.uri, filePath);
  // A running watch picks the file up itself; otherwise start one.
  if (!DownloadManager.hasRunningDownload(key)) {
    await DownloadOrchestrator.resumeDownload(shop, objectId, "queueIfActive");
  }
};

registerEvent("useAnkerGamesArchive", useAnkerGamesArchive);
