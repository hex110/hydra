import os from "node:os";

import {
  db,
  downloadsSublevel,
  gamesSublevel,
  levelKeys,
  localCollectionsSublevel,
} from "@main/level";
import { addGameToLibrary } from "@main/events/library/add-game-to-library";
import { isWishlistOnly } from "@shared";
import type {
  CloudLibraryImportOption,
  CloudLibraryImportResult,
  Game,
  SaveStoreDevice,
  UserPreferences,
} from "@types";

import { getActiveSaveStore } from "../cloud-save/save-store";
import { updateGameRecord } from "../game-record-updater";
import {
  markIntegrationFailed,
  markIntegrationSynced,
} from "../integration-status";
import { describeTaskError } from "../background-task-errors";
import { AchievementMemoryStore } from "../achievements/achievement-memory-store";
import { AchievementWatcherManager } from "../achievements/achievement-watcher-manager";
import { mergeAchievements } from "../achievements/merge-achievements";
import { createWishlistOnlyRecord } from "../library-sync/create-wishlist-only-record";
import { logger } from "../logger";
import { WindowManager } from "../window-manager";
import {
  buildDeviceCollections,
  buildDeviceGames,
  buildLibraryEntries,
  gameKey,
  planLibraryImport,
  planMerge,
  unionAchievements,
  type DeviceState,
  type LibraryState,
  type LocalGameView,
  type SyncedAchievement,
} from "./cloud-library-core";
import { PROFILE_FIELDS } from "./profile-fields";

const DEBOUNCE_MS = 5_000;
const STARTUP_DELAY_MS = 20_000;
const INTERVAL_MS = 15 * 60_000;

let debounceTimer: NodeJS.Timeout | null = null;
let intervalTimer: NodeJS.Timeout | null = null;
let running: Promise<void> | null = null;
let rerun = false;

const isEnabled = async () => {
  const preferences = await db
    .get<string, UserPreferences | null>(levelKeys.userPreferences, {
      valueEncoding: "json",
    })
    .catch(() => null);
  return (
    Boolean(preferences?.saveStore) &&
    preferences?.saveStoreSyncLibrary !== false
  );
};

const readLocalGames = async () => {
  const games: Game[] = [];
  for await (const [, game] of gamesSublevel.iterator()) games.push(game);
  return games;
};

/** Achievements are in memory only; they are read from game files after startup. */
const readLocalAchievements = (games: Game[]) => {
  const unlocked = new Map<string, SyncedAchievement[]>();
  if (!AchievementWatcherManager.hasFinishedPreSearch) return unlocked;

  for (const game of games) {
    const entry = AchievementMemoryStore.get(game.shop, game.objectId);
    if (entry) unlocked.set(gameKey(game), entry.unlockedAchievements);
  }
  return unlocked;
};

const toViews = async (
  games: Game[],
  unlocked: Map<string, SyncedAchievement[]>
) => {
  const views = new Map<string, LocalGameView>();
  for (const game of games) {
    const download =
      game.wishlisted === true
        ? await downloadsSublevel
            .get(levelKeys.game(game.shop, game.objectId))
            .catch(() => null)
        : null;
    views.set(gameKey(game), {
      ...Object.fromEntries(
        PROFILE_FIELDS.map((field) => [field, game[field]])
      ),
      collectionIds: game.collectionIds,
      profileEditedAt: game.profileEditedAt,
      unlockedAchievementNames: unlocked
        .get(gameKey(game))
        ?.map((achievement) => achievement.name.toUpperCase()),
      shop: game.shop,
      objectId: game.objectId,
      title: game.title,
      isDeleted: game.isDeleted,
      lastTimePlayed: game.lastTimePlayed,
      playStatus: game.playStatus,
      playStatusUpdatedAt: game.playStatusUpdatedAt,
      wishlisted: game.wishlisted,
      wishlistedUpdatedAt: game.wishlistedUpdatedAt,
      syncedPlayTimeInMilliseconds: game.syncedPlayTimeInMilliseconds,
      wishlistOnly: isWishlistOnly({
        ...game,
        download: download ?? undefined,
      }),
    });
  }
  return views;
};

const run = async () => {
  const store = getActiveSaveStore();
  if (!store || !(await isEnabled())) return;

  try {
    const states = await store.readDeviceStates<DeviceState>();
    const others = states.filter(
      (state) => state.deviceId && state.deviceId !== store.deviceId
    );
    const previous = states.find((state) => state.deviceId === store.deviceId);

    const games = await readLocalGames();
    const gamesByKey = new Map(games.map((game) => [gameKey(game), game]));
    const unlocked = readLocalAchievements(games);
    const views = await toViews(games, unlocked);

    const collectionRecords = await localCollectionsSublevel.values().all();
    const localCollections = buildDeviceCollections(collectionRecords);

    let changed = false;
    for (const action of planMerge(
      views,
      others,
      new Map(Object.entries(localCollections))
    )) {
      if (action.kind === "collection") {
        await localCollectionsSublevel.put(action.id, {
          id: action.id,
          ...action.collection,
        });
      } else if (action.kind === "patch") {
        await updateGameRecord(action.key, action.patch);
      } else if (action.kind === "createWishlist") {
        await createWishlistOnlyRecord(
          action.shop,
          action.objectId,
          action.title,
          action.platform,
          action.stamp
        );
      } else if (action.kind === "achievements") {
        const game = gamesByKey.get(action.key);
        if (!game) continue;
        // One game's achievements failing to merge must not stop the rest.
        await mergeAchievements(game, action.achievements, false).catch(
          (error) =>
            logger.warn("Failed to merge cloud achievements", action.key, error)
        );
      } else {
        await updateGameRecord(
          action.key,
          action.deleteEntry
            ? {
                wishlisted: false,
                wishlistedUpdatedAt: action.stamp,
                isDeleted: true,
              }
            : { wishlisted: false, wishlistedUpdatedAt: action.stamp }
        );
      }
      changed = true;
    }
    if (changed) WindowManager.sendToAppWindows("on-library-batch-complete");

    // Games whose achievements this device has not read yet keep what it last
    // published, so a sync soon after startup does not take unlocks back.
    const published = new Map<string, SyncedAchievement[]>();
    for (const [key, state] of Object.entries(previous?.games ?? {})) {
      if (state.achievements) published.set(key, state.achievements);
    }
    for (const [key, list] of unlocked) {
      published.set(key, unionAchievements(list));
    }

    const current = await readLocalGames();
    const state: DeviceState = {
      version: 1,
      deviceId: store.deviceId,
      hostname: os.hostname(),
      platform: process.platform,
      updatedAt: new Date().toISOString(),
      games: buildDeviceGames(current, published),
      collections: buildDeviceCollections(
        await localCollectionsSublevel.values().all()
      ),
    };
    await store.writeDeviceState(state);

    const library: LibraryState = {
      version: 1,
      deviceId: store.deviceId,
      hostname: state.hostname,
      updatedAt: state.updatedAt,
      games: buildLibraryEntries(
        current.map((game) => ({
          ...game,
          wishlistOnly: views.get(gameKey(game))?.wishlistOnly ?? false,
        }))
      ),
    };
    await store.writeLibrary(library);
    await markIntegrationSynced("cloud");
  } catch (error) {
    logger.warn("Failed to sync the library through the save store", error);
    markIntegrationFailed("cloud", describeTaskError(error));
  }
};

/** Runs one sync at a time; a request made meanwhile runs once more after. */
export const syncCloudLibrary = async () => {
  if (running) {
    rerun = true;
    return running;
  }

  running = run().finally(() => {
    running = null;
    if (rerun) {
      rerun = false;
      queueCloudLibrarySync();
    }
  });
  return running;
};

/** Called after a change that other devices should see. */
export const queueCloudLibrarySync = () => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void syncCloudLibrary();
  }, DEBOUNCE_MS);
};

export const startCloudLibrarySchedule = () => {
  if (intervalTimer) return;
  setTimeout(() => void syncCloudLibrary(), STARTUP_DELAY_MS);
  intervalTimer = setInterval(() => void syncCloudLibrary(), INTERVAL_MS);
};

/** The devices that have synced through the store, newest first. */
export const listSyncDevices = async (): Promise<SaveStoreDevice[]> => {
  const store = getActiveSaveStore();
  if (!store) return [];

  const states = await store.readDeviceStates<DeviceState>();
  return states
    .filter((state) => state.deviceId)
    .map((state) => ({
      id: state.deviceId,
      hostname: state.hostname ?? null,
      platform: state.platform ?? null,
      updatedAt: state.updatedAt,
      isThisDevice: state.deviceId === store.deviceId,
      games: Object.keys(state.games ?? {}).length,
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
};

const localLibraryKeys = async (games: Game[]) => {
  const views = await toViews(games, new Map());
  return new Set(
    buildLibraryEntries(
      games.map((game) => ({
        ...game,
        wishlistOnly: views.get(gameKey(game))?.wishlistOnly ?? false,
      }))
    ).map(gameKey)
  );
};

const readOtherLibraries = async () => {
  const store = getActiveSaveStore();
  if (!store) return [];
  const libraries = await store.readLibraries<LibraryState>();
  return libraries.filter(
    (library) =>
      library.deviceId &&
      library.deviceId !== store.deviceId &&
      Array.isArray(library.games)
  );
};

/** The other devices whose library list can be imported, with what it would add. */
export const listCloudLibraryImports = async (): Promise<
  CloudLibraryImportOption[]
> => {
  const localKeys = await localLibraryKeys(await readLocalGames());

  return (await readOtherLibraries())
    .map((library) => ({
      deviceId: library.deviceId,
      hostname: library.hostname ?? null,
      updatedAt: library.updatedAt,
      games: library.games.length,
      newGames: planLibraryImport(localKeys, [library]).length,
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
};

/**
 * Adds the games another device has and this library lacks. Only ever run on
 * request: the library list goes to the cloud, never back on its own.
 */
export const importCloudLibrary = async (
  deviceId: string
): Promise<CloudLibraryImportResult> => {
  const library = (await readOtherLibraries()).find(
    (candidate) => candidate.deviceId === deviceId
  );
  if (!library) return { imported: 0 };

  const entries = planLibraryImport(
    await localLibraryKeys(await readLocalGames()),
    [library]
  );

  for (const entry of entries) {
    await addGameToLibrary(
      entry.shop,
      entry.objectId,
      entry.title,
      entry.platform
    );
    if (entry.addedToLibraryAt) {
      await updateGameRecord(gameKey(entry), {
        addedToLibraryAt: new Date(entry.addedToLibraryAt),
      });
    }
  }

  if (entries.length > 0) {
    WindowManager.sendToAppWindows("on-library-batch-complete");
    queueCloudLibrarySync();
  }
  return { imported: entries.length };
};
