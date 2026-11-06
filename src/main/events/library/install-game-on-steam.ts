import { openSteamAppAction } from "@main/services/steam-integration/steam-app-action";
import { prepareSteamInstallEntry } from "@main/services/steam-integration/prepare-steam-install-entry";

import { registerEvent } from "../register-event";

const installGameOnSteam = async (
  _event: Electron.IpcMainInvokeEvent,
  steamAppId: string,
  title?: string
) => {
  await prepareSteamInstallEntry(steamAppId, title);
  await openSteamAppAction("install", steamAppId);
};

registerEvent("installGameOnSteam", installGameOnSteam);
