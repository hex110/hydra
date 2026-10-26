import { randomUUID } from "node:crypto";

import { gamesShopAssetsSublevel, gamesSublevel, levelKeys } from "@main/level";
import { WindowManager } from "@main/services/window-manager";
import { updateGameRecord } from "@main/services/game-record-updater";
import type { GameShop } from "@types";

import { registerEvent } from "../register-event";
import {
  getFloppyClient,
  normalizeTitle,
  getFloppySyncStatus,
  queueFloppySync,
  pullFromFloppy,
  startFloppyLibrarySync,
  FloppyClient,
} from "@main/services/floppy";

const testFloppyConnection = async (
  _event: Electron.IpcMainInvokeEvent,
  url: string,
  token: string
) => new FloppyClient({ url, token }).testConnection();

const syncFloppyLibrary = async (
  _event: Electron.IpcMainInvokeEvent,
  dryRun: boolean
) => startFloppyLibrarySync(dryRun);

registerEvent("testFloppyConnection", testFloppyConnection);
registerEvent("syncFloppyLibrary", syncFloppyLibrary);

registerEvent("getFloppySyncStatus", () => getFloppySyncStatus());
registerEvent("pullFloppy", () => pullFromFloppy());

registerEvent(
  "addFloppyGameAsCustom",
  async (_event, mediaId: string, title: string, image: string | null) => {
    const games = await gamesSublevel.values().all();
    const exists = games.some(
      (game) =>
        !game.isDeleted &&
        (game.floppyMediaId === mediaId ||
          normalizeTitle(game.title) === normalizeTitle(title))
    );
    if (exists) throw new Error("floppy-game-already-in-library");

    const objectId = randomUUID();
    const key = levelKeys.game("custom", objectId);
    await gamesShopAssetsSublevel.put(key, {
      updatedAt: Date.now(),
      objectId,
      shop: "custom",
      title,
      iconUrl: image,
      libraryHeroImageUrl: "",
      libraryImageUrl: image ?? "",
      logoImageUrl: "",
      logoPosition: null,
      coverImageUrl: image ?? "",
      downloadSources: [],
    });
    await gamesSublevel.put(key, {
      title,
      iconUrl: image,
      logoImageUrl: null,
      libraryHeroImageUrl: null,
      objectId,
      shop: "custom",
      remoteId: null,
      isDeleted: false,
      playTimeInMilliseconds: 0,
      lastTimePlayed: null,
      addedToLibraryAt: null,
      floppyMediaId: mediaId,
      floppyImported: true,
    });

    WindowManager.sendToAppWindows("on-library-batch-complete");
    void pullFromFloppy(true).catch(() => {});
  }
);

registerEvent("searchFloppyGames", async (_event, title: string) => {
  const client = await getFloppyClient();
  if (!client) throw new Error("floppy-not-configured");
  return client.searchGame(title);
});

registerEvent(
  "getGameFloppyMatch",
  async (_event, shop: GameShop, objectId: string) => {
    const game = await gamesSublevel
      .get(levelKeys.game(shop, objectId))
      .catch(() => null);
    const mediaId = game?.floppyMediaId ?? null;
    const client = await getFloppyClient();
    const title =
      mediaId && client
        ? await client.getTitle(mediaId).catch(() => null)
        : null;

    return { mediaId, title, unlinked: game?.floppyUnlinked === true };
  }
);

registerEvent(
  "setGameFloppyMatch",
  async (_event, shop: GameShop, objectId: string, mediaId: string | null) => {
    await updateGameRecord(levelKeys.game(shop, objectId), {
      floppyMediaId: mediaId,
      floppyUnlinked: mediaId === null,
    });

    if (mediaId !== null) {
      queueFloppySync(shop, objectId, "backfill");
      void pullFromFloppy(true).catch(() => {});
    }
  }
);
