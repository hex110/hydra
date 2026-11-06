import {
  gamesShopAssetsSublevel,
  gamesSublevel,
  levelKeys,
  steamHistorySublevel,
} from "@main/level";
import { IMPORT_FLAGS_CLEARED, isValidSteamAppId } from "@shared";

import { libraryWriteQueue } from "../library-sync/library-write-queue";
import { WindowManager } from "../window-manager";
import { steamArtworkUrls } from "../steam-history/steam-history-core";

/**
 * Makes the game an ordinary library game that Steam installs, so the install
 * watcher links its executable when Steam finishes. A copy that already has an
 * executable is left alone: it is not the one Steam is about to install.
 */
export const prepareSteamInstallEntry = async (
  steamAppId: string,
  fallbackTitle?: string
) => {
  if (!isValidSteamAppId(steamAppId)) return;

  const key = levelKeys.game("steam", steamAppId);
  const [history, assets] = await Promise.all([
    steamHistorySublevel.get(steamAppId).catch(() => null),
    gamesShopAssetsSublevel.get(key).catch(() => null),
  ]);

  const changed = await libraryWriteQueue.run(async () => {
    const existing = await gamesSublevel.get(key).catch(() => null);

    if (existing) {
      if (existing.executablePath) return false;

      await gamesSublevel.put(key, {
        ...existing,
        isDeleted: false,
        source: "hydra",
        addedToLibraryAt: existing.addedToLibraryAt ?? new Date(),
        ...IMPORT_FLAGS_CLEARED,
        hasActiveSteamImport: true,
      });
      return true;
    }

    const title = history?.name || assets?.title || fallbackTitle;
    if (!title) return false;

    const artwork = steamArtworkUrls(steamAppId);
    await gamesSublevel.put(key, {
      title,
      iconUrl: assets?.iconUrl ?? artwork.iconUrl,
      libraryHeroImageUrl:
        assets?.libraryHeroImageUrl ?? artwork.libraryHeroImageUrl,
      logoImageUrl: assets?.logoImageUrl ?? artwork.logoImageUrl,
      objectId: steamAppId,
      shop: "steam",
      remoteId: null,
      isDeleted: false,
      playTimeInMilliseconds: 0,
      lastTimePlayed: null,
      addedToLibraryAt: new Date(),
      source: "hydra",
      hasActiveSteamImport: true,
    });
    return true;
  });

  if (changed) WindowManager.sendToAppWindows("on-library-batch-complete");
};
