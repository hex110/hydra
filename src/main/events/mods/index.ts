import { dialog } from "electron";

import type { GameShop, NexusGameMatch, NexusModSort } from "@types";
import { ModStore } from "@main/services/mods/mod-store";
import {
  checkModUpdates,
  getNexusGameForLibraryGame,
  hasTorBoxToken,
  installModFromArchive,
  installNexusModFile,
  runModAction,
} from "@main/services/mods/mods";
import {
  getNexusModFiles,
  searchNexusGames,
  searchNexusMods,
} from "@main/services/mods/nexus";
import { WindowManager } from "@main/services/window-manager";
import { isNxmHandler, registerNxmHandler } from "@main/services/mods/nxm";
import { registerEvent } from "../register-event";

registerEvent("getGameMods", (_event, shop: GameShop, objectId: string) =>
  ModStore.getGameMods(shop, objectId)
);

registerEvent(
  "getNexusGameForLibraryGame",
  (_event, shop: GameShop, objectId: string) =>
    getNexusGameForLibraryGame(shop, objectId)
);

registerEvent(
  "setNexusGameForLibraryGame",
  (_event, shop: GameShop, objectId: string, game: NexusGameMatch | null) =>
    ModStore.setNexusGame(shop, objectId, game)
);

registerEvent("searchNexusGames", (_event, name: string) =>
  searchNexusGames(name)
);

registerEvent(
  "searchNexusMods",
  (
    _event,
    gameDomain: string,
    search: string,
    sort: NexusModSort,
    offset: number
  ) => searchNexusMods({ gameDomain, search, sort, offset })
);

registerEvent("getNexusModFiles", (_event, gameId: number, modId: number) =>
  getNexusModFiles(gameId, modId)
);

registerEvent("hasTorBoxToken", () => hasTorBoxToken());

registerEvent(
  "installNexusModFile",
  (
    _event,
    shop: GameShop,
    objectId: string,
    file: Parameters<typeof installNexusModFile>[2]
  ) => installNexusModFile(shop, objectId, file)
);

registerEvent(
  "installModFromFile",
  async (_event, shop: GameShop, objectId: string) => {
    const window = WindowManager.mainWindow;
    const options: Electron.OpenDialogOptions = {
      properties: ["openFile"],
      filters: [
        { name: "Mods", extensions: ["zip", "7z", "rar", "dll", "pak", "asi"] },
        { name: "All files", extensions: ["*"] },
      ],
    };
    const selection = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    if (selection.canceled || !selection.filePaths[0]) return null;
    return installModFromArchive(shop, objectId, selection.filePaths[0]);
  }
);

registerEvent(
  "setModEnabled",
  (_event, shop: GameShop, objectId: string, modId: string, enabled: boolean) =>
    runModAction(() => ModStore.setEnabled(shop, objectId, modId, enabled))
);

registerEvent(
  "moveMod",
  (
    _event,
    shop: GameShop,
    objectId: string,
    modId: string,
    direction: -1 | 1
  ) => runModAction(() => ModStore.move(shop, objectId, modId, direction))
);

registerEvent(
  "removeMod",
  (_event, shop: GameShop, objectId: string, modId: string) =>
    runModAction(() => ModStore.remove(shop, objectId, modId))
);

registerEvent("checkModUpdates", (_event, shop: GameShop, objectId: string) =>
  checkModUpdates(shop, objectId)
);

registerEvent("isNxmHandler", () => isNxmHandler());

registerEvent("registerNxmHandler", () => registerNxmHandler());
