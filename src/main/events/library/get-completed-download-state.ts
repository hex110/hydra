import path from "node:path";

import { registerEvent } from "../register-event";
import { downloadsSublevel, gamesSublevel, levelKeys } from "@main/level";
import { GameFilesManager } from "@main/services";
import {
  getCompletedDownloadState as resolveCompletedDownloadState,
  resolveDownloadFolder,
  type CompletedDownloadState,
} from "@main/services/download-game-folder";
import type { GameShop } from "@types";

/**
 * A game unpacked outside Hydra is adopted the first time the Downloads page
 * asks: the download points at the unpacked folder and the executable is
 * looked for, as after Hydra's own extraction.
 */
const adoptFolderExtractedOutside = async (
  shop: GameShop,
  objectId: string
) => {
  const gameKey = levelKeys.game(shop, objectId);
  const download = await downloadsSublevel.get(gameKey);
  if (!download || download.extracting) return;

  const folder = resolveDownloadFolder(download);
  if (folder.kind !== "folder" || !folder.extractedOutside) return;

  await downloadsSublevel.put(gameKey, {
    ...download,
    folderName: path.relative(download.downloadPath, folder.folderPath),
  });

  await new GameFilesManager(shop, objectId).searchAndBindExecutable();
};

const getCompletedDownloadState = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string
): Promise<CompletedDownloadState> => {
  const gameKey = levelKeys.game(shop, objectId);

  await adoptFolderExtractedOutside(shop, objectId).catch(() => {});

  const [download, game] = await Promise.all([
    downloadsSublevel.get(gameKey),
    gamesSublevel.get(gameKey).catch(() => null),
  ]);

  if (!download) return "missing";

  return resolveCompletedDownloadState(download, game);
};

registerEvent("getCompletedDownloadState", getCompletedDownloadState);
