import { shell } from "electron";
import { updateSteamGame } from "@main/services/steam-integration/steam-updates";
import {
  getSteamBranches,
  switchSteamBranch,
} from "@main/services/steam-integration/steam-branches";
import { isValidSteamAppId } from "@shared";
import { SteamStateService } from "@main/services/steam-integration/steam-state";
import { SteamDownloads } from "@main/services/steam-integration/steam-downloads";

import { registerEvent } from "../register-event";

registerEvent("getSteamDownloads", () => SteamDownloads.list());

registerEvent(
  "dismissSteamDownload",
  (_event: Electron.IpcMainInvokeEvent, steamAppId: string) =>
    SteamDownloads.dismiss(steamAppId)
);

registerEvent("openSteamDownloads", () =>
  shell.openExternal("steam://open/downloads")
);

registerEvent("getSteamState", () => SteamStateService.refresh());

registerEvent("openSteam", () => SteamStateService.open());

registerEvent(
  "updateSteamGame",
  async (
    _event: Electron.IpcMainInvokeEvent,
    appId: string,
    startSteam: boolean
  ) => {
    if (!isValidSteamAppId(appId)) throw new Error("invalid-steam-app-id");
    return updateSteamGame(appId, startSteam === true);
  }
);

registerEvent(
  "getSteamBranches",
  async (_event: Electron.IpcMainInvokeEvent, appId: string) =>
    isValidSteamAppId(appId) ? getSteamBranches(appId) : null
);

registerEvent(
  "switchSteamBranch",
  async (
    _event: Electron.IpcMainInvokeEvent,
    appId: string,
    branch: string
  ) => {
    if (!isValidSteamAppId(appId) || typeof branch !== "string") {
      throw new Error("invalid-steam-branch-request");
    }
    return switchSteamBranch(appId, branch);
  }
);
