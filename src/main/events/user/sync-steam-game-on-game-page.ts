import { WindowManager } from "@main/services/window-manager";
import { refreshSteamGameExecutable } from "@main/services/steam-integration/link-imported-steam-executables";

import { registerEvent } from "../register-event";

const STEAM_APP_ID_PATTERN = /^[1-9]\d{0,9}$/;

/** Opening a Steam game's page picks up an install made through Steam meanwhile. */
const syncSteamGameOnGamePageEvent = async (
  _event: Electron.IpcMainInvokeEvent,
  steamAppId: string
): Promise<boolean> => {
  if (!STEAM_APP_ID_PATTERN.test(steamAppId)) return false;

  const changed = await refreshSteamGameExecutable(steamAppId).catch(
    () => false
  );
  if (changed) WindowManager.sendToAppWindows("on-library-batch-complete");
  return changed;
};

registerEvent("syncSteamGameOnGamePage", syncSteamGameOnGamePageEvent);
