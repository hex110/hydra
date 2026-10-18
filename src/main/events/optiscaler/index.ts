import { isOptiScalerProxyDll } from "@shared";
import { updateGameRecord } from "@main/services/game-record-updater";
import { levelKeys } from "@main/level";
import {
  OptiScaler,
  OptiScalerError,
} from "@main/services/optiscaler/optiscaler";
import type { GameShop, OptiScalerProxyDll } from "@types";
import { registerEvent } from "../register-event";

const getOptiScalerOverview = () => OptiScaler.getOverview();

const checkOptiScalerUpdates = () => OptiScaler.checkForUpdates();

const downloadOptiScaler = async () => {
  const { version } = await OptiScaler.downloadLatest();
  return version;
};

const clearOptiScalerCache = () => OptiScaler.clearCache();

const runOptiScalerBulk = (
  _event: Electron.IpcMainInvokeEvent,
  mode: "install-eligible" | "update-installed"
) => OptiScaler.runBulk(mode);

const getGameOptiScalerStatus = (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string
) => OptiScaler.getGameStatus(shop, objectId);

const installGameOptiScaler = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  version?: string
) => {
  try {
    const installation = await OptiScaler.install(shop, objectId, version);
    return { ok: true as const, installation };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof OptiScalerError ? error.code : "failed",
      message: error instanceof Error ? error.message : String(error),
    };
  }
};

const uninstallGameOptiScaler = (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string
) => OptiScaler.uninstall(shop, objectId);

const setGameOptiScalerAutoInstallDisabled = (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  disabled: boolean
) => OptiScaler.setAutoInstallDisabled(shop, objectId, disabled);

const setGameOptiScalerProxyDll = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  proxyDll: OptiScalerProxyDll | null
) => {
  await updateGameRecord(levelKeys.game(shop, objectId), {
    optiScalerProxyDll: isOptiScalerProxyDll(proxyDll) ? proxyDll : null,
  });
};

registerEvent("getOptiScalerOverview", getOptiScalerOverview);
registerEvent("checkOptiScalerUpdates", checkOptiScalerUpdates);
registerEvent("downloadOptiScaler", downloadOptiScaler);
registerEvent("clearOptiScalerCache", clearOptiScalerCache);
registerEvent("runOptiScalerBulk", runOptiScalerBulk);
registerEvent("getGameOptiScalerStatus", getGameOptiScalerStatus);
registerEvent("installGameOptiScaler", installGameOptiScaler);
registerEvent("uninstallGameOptiScaler", uninstallGameOptiScaler);
registerEvent(
  "setGameOptiScalerAutoInstallDisabled",
  setGameOptiScalerAutoInstallDisabled
);
registerEvent("setGameOptiScalerProxyDll", setGameOptiScalerProxyDll);
