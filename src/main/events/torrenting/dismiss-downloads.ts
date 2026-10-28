import { downloadsSublevel, levelKeys } from "@main/level";
import { WindowManager } from "@main/services";
import {
  isCompletedLikeDownload,
  isSeedingDownload,
} from "../../../types/download-contract";
import type { GameShop } from "@types";

import { registerEvent } from "../register-event";

/** Takes finished downloads off the Downloads page; their files and records stay. */
const dismissDownloads = async (
  _event: Electron.IpcMainInvokeEvent,
  downloads: { shop: GameShop; objectId: string }[]
) => {
  for (const { shop, objectId } of downloads) {
    const gameKey = levelKeys.game(shop, objectId);
    const download = await downloadsSublevel.get(gameKey);

    if (
      !download ||
      download.extracting ||
      isSeedingDownload(download) ||
      !isCompletedLikeDownload(download)
    ) {
      continue;
    }

    await downloadsSublevel.put(gameKey, { ...download, dismissed: true });
  }

  WindowManager.sendDownloadsUpdated();
};

registerEvent("dismissDownloads", dismissDownloads);
