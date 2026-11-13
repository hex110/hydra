import { getSteamLaunchOptions } from "@main/services/steam-integration/steam-launch-options";
import { isValidSteamAppId } from "@shared";

import { registerEvent } from "../register-event";

registerEvent(
  "getSteamLaunchOptions",
  async (_event: Electron.IpcMainInvokeEvent, appId: string) =>
    isValidSteamAppId(appId) ? getSteamLaunchOptions(appId) : []
);
