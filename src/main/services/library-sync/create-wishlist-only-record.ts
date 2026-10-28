import { gamesShopAssetsSublevel, gamesSublevel, levelKeys } from "@main/level";
import type { GameShop } from "@types";

import { libraryWriteQueue } from "./library-write-queue";

/** Remembers a wish for a game that is not in the library, without adding it. */
export const createWishlistOnlyRecord = async (
  shop: GameShop,
  objectId: string,
  title: string,
  platform: string | null,
  wishlistedUpdatedAt = new Date().toISOString()
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
      wishlistedUpdatedAt,
    });
  });
};
