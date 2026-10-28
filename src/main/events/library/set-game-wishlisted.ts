import {
  downloadsSublevel,
  gamesShopAssetsSublevel,
  gamesSublevel,
  levelKeys,
} from "@main/level";
import { updateGameRecord } from "@main/services/game-record-updater";
import { queueFloppySync } from "@main/services/floppy";
import { libraryWriteQueue } from "@main/services/library-sync/library-write-queue";
import { WindowManager } from "@main/services/window-manager";
import { isWishlistOnly } from "@shared";
import type { GameShop } from "@types";

import { registerEvent } from "../register-event";

/** Remembers a wish for a game that is not in the library, without adding it. */
const createWishlistOnlyRecord = async (
  shop: GameShop,
  objectId: string,
  title: string,
  platform: string | null
) => {
  const gameKey = levelKeys.game(shop, objectId);
  const assets = await gamesShopAssetsSublevel.get(gameKey).catch(() => null);

  await libraryWriteQueue.run(async () => {
    const existing = await gamesSublevel.get(gameKey).catch(() => null);

    await gamesSublevel.put(gameKey, {
      ...(existing ?? {
        title,
        iconUrl: assets?.iconUrl ?? null,
        libraryHeroImageUrl: assets?.libraryHeroImageUrl ?? null,
        logoImageUrl: assets?.logoImageUrl ?? null,
        objectId,
        shop,
        remoteId: null,
        playTimeInMilliseconds: 0,
        lastTimePlayed: null,
        platform,
      }),
      isDeleted: false,
      addedToLibraryAt: null,
      source: "hydra",
      wishlisted: true,
    });
  });
};

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
};

registerEvent("setGameWishlisted", setGameWishlisted);
