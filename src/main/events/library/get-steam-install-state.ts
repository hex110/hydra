import { getSteamInstallState as readSteamInstallState } from "@main/services/steam-integration/steam-install-state";

import { registerEvent } from "../register-event";

registerEvent(
  "getSteamInstallState",
  (_event: Electron.IpcMainInvokeEvent, steamAppId: string) =>
    readSteamInstallState(steamAppId)
);
