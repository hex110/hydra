import { shell } from "electron";
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
