import {
  db,
  gamesShopAssetsSublevel,
  gamesSublevel,
  levelKeys,
  steamWishlistSublevel,
} from "@main/level";
import type {
  SteamWishlistEntry,
  SteamWishlistEvent,
  UserPreferences,
} from "@types";

import {
  failBackgroundTask,
  registerBackgroundTaskRetry,
  removeBackgroundTask,
  updateBackgroundTask,
} from "../background-tasks";
import {
  markIntegrationFailed,
  markIntegrationSynced,
} from "../integration-status";
import { queueFloppySync } from "../floppy";
import { updateGameRecord } from "../game-record-updater";
import { libraryWriteQueue } from "../library-sync/library-write-queue";
import { logger } from "../logger";
import { publishSteamWishlistNotification } from "../notifications";
import { WindowManager } from "../window-manager";
import {
  fetchStoreItems,
  fetchWishlist,
  type SteamHistoryCredentials,
} from "./steam-history-api";
import { getSteamHistoryCredentials } from "./steam-history-sync";
import { steamArtworkUrls } from "./steam-history-core";
import {
  isUsableStoreItem,
  toWishlistEntry,
  upcomingEntries,
  wishlistEvent,
} from "./steam-wishlist-core";

const SYNC_INTERVAL_MS = 3 * 3_600_000;
const SYNC_STARTUP_DELAY_MS = 120_000;

interface WishlistOptions {
  addToLibrary: boolean;
  notifyDate: boolean;
}

export interface SteamWishlistResult {
  wishlist: number;
  upcoming: number;
  released: number;
  added: number;
}

let running = false;

const readOptions = async () => {
  const preferences = await db
    .get<string, UserPreferences | null>(levelKeys.userPreferences, {
      valueEncoding: "json",
    })
    .catch(() => null);

  return {
    track: preferences?.steamWishlistTrack === true,
    options: {
      addToLibrary: preferences?.steamWishlistAddToLibrary !== false,
      notifyDate: preferences?.steamWishlistNotifyDate === true,
    },
  };
};

/** Lists an upcoming game and marks it wishlisted, without touching a game the user removed. */
const listUpcomingGame = async (entry: SteamWishlistEntry) => {
  const key = levelKeys.game("steam", entry.appId);
  const existing = await gamesSublevel.get(key).catch(() => null);

  if (existing) {
    if (existing.isDeleted || existing.wishlisted) return false;
    await updateGameRecord(key, { wishlisted: true });
    queueFloppySync("steam", entry.appId, "wishlist");
    return false;
  }

  const artwork = steamArtworkUrls(entry.appId);
  if (!(await gamesShopAssetsSublevel.get(key).catch(() => null))) {
    await gamesShopAssetsSublevel.put(key, {
      objectId: entry.appId,
      shop: "steam",
      title: entry.name,
      ...artwork,
      logoPosition: null,
      coverImageUrl: artwork.libraryImageUrl,
      downloadSources: [],
      updatedAt: Date.now(),
    });
  }

  const created = await libraryWriteQueue.run(async () => {
    if (await gamesSublevel.get(key).catch(() => null)) return false;

    await gamesSublevel.put(key, {
      title: entry.name,
      iconUrl: artwork.iconUrl,
      libraryHeroImageUrl: artwork.libraryHeroImageUrl,
      logoImageUrl: artwork.logoImageUrl,
      objectId: entry.appId,
      shop: "steam",
      remoteId: null,
      isDeleted: false,
      playTimeInMilliseconds: 0,
      lastTimePlayed: null,
      addedToLibraryAt: null,
      source: "hydra",
      wishlisted: true,
      steamWishlistImported: true,
    });
    return true;
  });

  if (created) queueFloppySync("steam", entry.appId, "wishlist");
  return created;
};

const run = async (
  credentials: SteamHistoryCredentials,
  options: WishlistOptions
): Promise<SteamWishlistResult> => {
  const items = await fetchWishlist(credentials);
  const stored = await steamWishlistSublevel.values().all();
  const previous = new Map(stored.map((entry) => [entry.appId, entry]));
  const storeItems = await fetchStoreItems(items.map((item) => item.appid));
  const byAppId = new Map(
    storeItems.map((item) => [String(item.appid), item] as const)
  );

  const now = Date.now();
  const nowSeconds = Math.floor(now / 1000);
  const entries: SteamWishlistEntry[] = [];
  const events: [SteamWishlistEntry, SteamWishlistEvent][] = [];

  for (const item of items) {
    const appId = String(item.appid);
    const old = previous.get(appId) ?? null;
    const storeItem = byAppId.get(appId);

    // Keep what we knew when the store gives nothing usable.
    if (!storeItem || !isUsableStoreItem(storeItem)) {
      if (old) entries.push(old);
      continue;
    }

    const next = toWishlistEntry(storeItem, appId, item.date_added ?? 0, now);
    const event = wishlistEvent(old, next, nowSeconds);
    if (event) events.push([next, event]);
    entries.push(next);
  }

  await Promise.all(
    entries.map((entry) => steamWishlistSublevel.put(entry.appId, entry))
  );
  // Bought, or taken off the wishlist.
  const current = new Set(entries.map((entry) => entry.appId));
  await Promise.all(
    stored
      .filter((entry) => !current.has(entry.appId))
      .map((entry) => steamWishlistSublevel.del(entry.appId))
  );

  const upcoming = upcomingEntries(entries);
  let added = 0;
  if (options.addToLibrary) {
    for (const entry of upcoming) {
      if (await listUpcomingGame(entry)) added += 1;
    }
  }

  const released = events
    .filter(([, event]) => event === "released")
    .map(([entry]) => entry);
  const dated = events
    .filter(([, event]) => event === "date-announced")
    .map(([entry]) => entry);

  await publishSteamWishlistNotification(released, "released").catch((error) =>
    logger.error("Failed to publish the Steam release notification", error)
  );
  if (options.notifyDate) {
    await publishSteamWishlistNotification(dated, "date-announced").catch(
      (error) =>
        logger.error(
          "Failed to publish the Steam release date notification",
          error
        )
    );
  }

  return {
    wishlist: entries.length,
    upcoming: upcoming.length,
    released: released.length,
    added,
  };
};

/**
 * Checks the Steam wishlist in the background. A scheduled run (`quiet`)
 * leaves nothing on the Downloads page when it found nothing new.
 */
export const startSteamWishlistSync = async (quiet = false) => {
  if (running) return;

  const credentials = await getSteamHistoryCredentials();
  if (!credentials) throw new Error("steam-history-not-configured");

  const { track, options } = await readOptions();
  if (!track && quiet) return;

  running = true;
  updateBackgroundTask("steam-wishlist", {
    state: "running",
    processed: 0,
    total: null,
    result: null,
  });

  try {
    const result = await run(credentials, options);

    if (quiet && result.released === 0 && result.added === 0) {
      removeBackgroundTask("steam-wishlist");
    } else {
      updateBackgroundTask("steam-wishlist", {
        state: "done",
        result: { ...result },
      });
    }

    if (result.added > 0) {
      WindowManager.sendToAppWindows("on-library-batch-complete");
    }
    await markIntegrationSynced("steamWishlist");
  } catch (error) {
    logger.error("Steam wishlist sync failed", error);
    markIntegrationFailed(
      "steamWishlist",
      failBackgroundTask("steam-wishlist", error, { quiet })
    );
  } finally {
    running = false;
  }
};

registerBackgroundTaskRetry("steam-wishlist", () => startSteamWishlistSync());

let timer: NodeJS.Timeout | null = null;

export const startSteamWishlistSchedule = () => {
  if (timer) return;

  const tick = () => {
    startSteamWishlistSync(true).catch((error: unknown) => {
      if (
        error instanceof Error &&
        error.message === "steam-history-not-configured"
      )
        return;
      logger.error("Steam wishlist sync failed to start", error);
    });
  };

  setTimeout(tick, SYNC_STARTUP_DELAY_MS);
  timer = setInterval(tick, SYNC_INTERVAL_MS);
};
