import { downloadsSublevel, gamesSublevel, levelKeys } from "@main/level";
import { updateGameRecord } from "@main/services/game-record-updater";
import { queueFloppySync } from "@main/services/floppy";
import { queueCloudLibrarySync } from "@main/services/cloud-library-sync";
import { createWishlistOnlyRecord } from "@main/services/library-sync/create-wishlist-only-record";
import { WindowManager } from "@main/services/window-manager";
import { isWishlistOnly } from "@shared";
import type { GameShop } from "@types";

import { registerEvent } from "../register-event";

const setGameWishlisted = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  wishlisted: boolean,
  title?: string,
  platform?: string | null
) => {
  const gameKey = levelKeys.game(shop, objectId);
  const existing = await gamesSublevel.get(gameKey).catch(() => null);

  if (wishlisted && (!existing || existing.isDeleted)) {
    if (!title) throw new Error("A title is needed to wishlist a new game");
    await createWishlistOnlyRecord(shop, objectId, title, platform ?? null);
  } else if (!wishlisted && existing && !existing.isDeleted) {
    const download = await downloadsSublevel.get(gameKey).catch(() => null);
    // Nothing else held the entry, so dropping the wish drops the entry.
    const patch = isWishlistOnly({ ...existing, download })
      ? { wishlisted: false, isDeleted: true }
      : { wishlisted: false };
    await updateGameRecord(gameKey, patch);
  } else {
    await updateGameRecord(gameKey, { wishlisted });
  }

  WindowManager.sendToAppWindows("on-library-batch-complete");
  queueFloppySync(shop, objectId, "wishlist");
  queueCloudLibrarySync();
};

registerEvent("setGameWishlisted", setGameWishlisted);
