import os from "node:os";

import { db, downloadsSublevel, gamesSublevel, levelKeys } from "@main/level";
import { isWishlistOnly } from "@shared";
import type { Game, SaveStoreDevice, UserPreferences } from "@types";

import { getActiveSaveStore } from "../cloud-save/save-store";
import { updateGameRecord } from "../game-record-updater";
import {
  markIntegrationFailed,
  markIntegrationSynced,
} from "../integration-status";
import { describeTaskError } from "../background-task-errors";
import { createWishlistOnlyRecord } from "../library-sync/create-wishlist-only-record";
import { logger } from "../logger";
import { WindowManager } from "../window-manager";
import {
  buildDeviceGames,
  gameKey,
  planMerge,
  type DeviceState,
  type LocalGameView,
} from "./cloud-library-core";

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

const toViews = async (games: Game[]) => {
  const views = new Map<string, LocalGameView>();
  for (const game of games) {
    const download =
      game.wishlisted === true
        ? await downloadsSublevel
            .get(levelKeys.game(game.shop, game.objectId))
            .catch(() => null)
        : null;
    views.set(gameKey(game), {
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

    let changed = false;
    const actions = planMerge(await toViews(await readLocalGames()), others);
    for (const action of actions) {
      if (action.kind === "patch") {
        await updateGameRecord(action.key, action.patch);
      } else if (action.kind === "createWishlist") {
        await createWishlistOnlyRecord(
          action.shop,
          action.objectId,
          action.title,
          action.platform,
          action.stamp
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

    const state: DeviceState = {
      version: 1,
      deviceId: store.deviceId,
      hostname: os.hostname(),
      platform: process.platform,
      updatedAt: new Date().toISOString(),
      games: buildDeviceGames(await readLocalGames()),
    };
    await store.writeDeviceState(state);
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
