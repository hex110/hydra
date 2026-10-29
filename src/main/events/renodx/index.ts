import type { GameRenoDxStatus, GameShop, RenoDxBulkMode } from "@types";
import { RenoDx, RenoDxError } from "@main/services/renodx/renodx";
import { registerEvent } from "../register-event";

const getRenoDxOverview = () => RenoDx.getOverview();

const checkRenoDxUpdates = () => RenoDx.checkForUpdates();

const clearRenoDxCache = () => RenoDx.clearCache();

const runRenoDxBulk = (
  _event: Electron.IpcMainInvokeEvent,
  mode: RenoDxBulkMode
) => RenoDx.runBulk(mode);

const getGameRenoDxStatus = (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string
): Promise<GameRenoDxStatus> => RenoDx.getGameStatus(shop, objectId);

const installGameRenoDx = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string
) => {
  try {
    const installation = await RenoDx.install(shop, objectId);
    return { ok: true as const, installation };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof RenoDxError ? error.code : "failed",
      message: error instanceof Error ? error.message : String(error),
    };
  }
};

const uninstallGameRenoDx = (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string
) => RenoDx.uninstall(shop, objectId);

const setGameRenoDxAutoInstallDisabled = (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  disabled: boolean
) => RenoDx.setAutoInstallDisabled(shop, objectId, disabled);

registerEvent("getRenoDxOverview", getRenoDxOverview);
registerEvent("checkRenoDxUpdates", checkRenoDxUpdates);
registerEvent("clearRenoDxCache", clearRenoDxCache);
registerEvent("runRenoDxBulk", runRenoDxBulk);
registerEvent("getGameRenoDxStatus", getGameRenoDxStatus);
registerEvent("installGameRenoDx", installGameRenoDx);
registerEvent("uninstallGameRenoDx", uninstallGameRenoDx);
registerEvent(
  "setGameRenoDxAutoInstallDisabled",
  setGameRenoDxAutoInstallDisabled
);
