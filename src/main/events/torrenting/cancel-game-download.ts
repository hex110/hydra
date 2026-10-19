import { registerEvent } from "../register-event";
import { DownloadOrchestrator, logger } from "@main/services";
import type { GameShop } from "@types";

const cancelGameDownload = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  deleteFiles = true
) => {
  logger.log(`[Downloads] Cancel requested for ${shop}:${objectId}`);
  return DownloadOrchestrator.cancelDownloadById(shop, objectId, deleteFiles);
};

registerEvent("cancelGameDownload", cancelGameDownload);
