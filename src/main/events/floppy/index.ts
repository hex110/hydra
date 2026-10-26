import { gamesSublevel, levelKeys } from "@main/level";
import { updateGameRecord } from "@main/services/game-record-updater";
import type { GameShop } from "@types";

import { registerEvent } from "../register-event";
import {
  getFloppyClient,
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
