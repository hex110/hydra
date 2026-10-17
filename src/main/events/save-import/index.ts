import {
  SaveImport,
  SaveImportFailure,
} from "@main/services/save-import/save-import";
import { readWindowsInstall } from "@main/services/save-import/windows-install";
import type { GameShop, SaveImportOptions } from "@types";
import { registerEvent } from "../register-event";

const toFailure = (error: unknown) => ({
  ok: false as const,
  error: error instanceof SaveImportFailure ? error.code : "failed",
  message: error instanceof Error ? error.message : String(error),
});

const listSaveImportSources = () => SaveImport.listSources();

/** The Windows user profiles in a folder, or null when it is not a Windows drive. */
const inspectSaveImportFolder = (
  _event: Electron.IpcMainInvokeEvent,
  rootPath: string
) => readWindowsInstall(rootPath)?.userProfiles ?? null;

const previewGameSaveImport = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  sourceId?: string
) => {
  try {
    return {
      ok: true as const,
      previews: await SaveImport.preview(shop, objectId, sourceId),
    };
  } catch (error) {
    return toFailure(error);
  }
};

const applyGameSaveImport = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  sourceId: string,
  options: SaveImportOptions
) => {
  try {
    return {
      ok: true as const,
      result: await SaveImport.apply(shop, objectId, sourceId, options),
    };
  } catch (error) {
    return toFailure(error);
  }
};

const dismissGameSaveImport = (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string
) => SaveImport.dismissPending(shop, objectId);

const runSaveImportBulk = () => SaveImport.runBulk();

registerEvent("listSaveImportSources", listSaveImportSources);
registerEvent("inspectSaveImportFolder", inspectSaveImportFolder);
registerEvent("previewGameSaveImport", previewGameSaveImport);
registerEvent("applyGameSaveImport", applyGameSaveImport);
registerEvent("dismissGameSaveImport", dismissGameSaveImport);
registerEvent("runSaveImportBulk", runSaveImportBulk);
