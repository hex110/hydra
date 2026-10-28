import { createHash, randomUUID } from "node:crypto";

import { db, levelKeys } from "@main/level";
import { logger } from "@main/services/logger";
import type {
  SaveStoreCleanupResult,
  SaveStoreConfig,
  SaveStoreUsage,
  UserPreferences,
} from "@types";

import { createSaveStoreBackend } from "./backends";
import { SelfHostedSaveStore } from "./self-hosted-save-store";
import { cleanUpSaveStore, scanSaveStore } from "./store-maintenance";

export const DEFAULT_KEEP_VERSIONS = 5;

export { isRcloneAvailable } from "./backends";
export {
  SaveStoreConflictError,
  SelfHostedSaveStore,
} from "./self-hosted-save-store";

let active: SelfHostedSaveStore | null = null;
let deviceId: string | null = null;
let activeScopeId: string | null = null;

const isUsable = (config: SaveStoreConfig | null | undefined) =>
  config?.kind === "folder"
    ? Boolean(config.path?.trim())
    : config?.kind === "rclone"
      ? Boolean(config.remote?.trim())
      : false;

/** The user's own save store, which replaces Hydra Cloud when set. */
export const getActiveSaveStore = () => active;

export const isSelfHostedSaveStoreActive = () => active !== null;

/**
 * Keys local sync state (anchors, custom paths, pending deletions) when the
 * user's own store is on, in place of the Hydra user id. One per location, so
 * switching stores never compares against another store's history.
 */
export const getSaveSyncScopeId = () => activeScopeId;

/** Names this device in the store; made once and kept. */
const ensureDeviceId = async () => {
  if (deviceId) return deviceId;
  const stored = await db
    .get<string, string>(levelKeys.saveStoreDeviceId, {
      valueEncoding: "utf8",
    })
    .catch(() => null);
  deviceId = stored || randomUUID();
  if (!stored) {
    await db.put(levelKeys.saveStoreDeviceId, deviceId, {
      valueEncoding: "utf8",
    });
  }
  return deviceId;
};

export const configureSaveStore = (
  config: SaveStoreConfig | null | undefined
) => {
  const usable = config && isUsable(config) ? config : null;
  active =
    usable && deviceId
      ? new SelfHostedSaveStore(createSaveStoreBackend(usable), deviceId)
      : null;
  activeScopeId = usable
    ? `store:${createHash("sha256")
        .update(JSON.stringify(usable))
        .digest("hex")
        .slice(0, 16)}`
    : null;
};

export const loadSaveStoreConfig = async () => {
  const preferences = await db
    .get<string, UserPreferences | null>(levelKeys.userPreferences, {
      valueEncoding: "json",
    })
    .catch(() => null);
  await ensureDeviceId();
  configureSaveStore(preferences?.saveStore);
};

const keepVersionsFrom = async () => {
  const preferences = await db
    .get<string, UserPreferences | null>(levelKeys.userPreferences, {
      valueEncoding: "json",
    })
    .catch(() => null);
  return preferences?.saveStoreKeepVersions ?? DEFAULT_KEEP_VERSIONS;
};

const requireStore = () => {
  if (!active) throw new Error("save-store-not-configured");
  return active;
};

export const getSaveStoreUsage = async (): Promise<SaveStoreUsage> =>
  scanSaveStore(requireStore().backend, {
    keepVersions: await keepVersionsFrom(),
  });

export const cleanUpActiveSaveStore =
  async (): Promise<SaveStoreCleanupResult> =>
    cleanUpSaveStore(requireStore().backend, {
      keepVersions: await keepVersionsFrom(),
    });

const CLEANUP_STARTUP_DELAY_MS = 2 * 60_000;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60_000;

/** Prunes old versions and unused files at most once a day while a store is on. */
export const startSaveStoreMaintenance = () => {
  setTimeout(async () => {
    if (!active) return;
    const last = await db
      .get<string, number>(levelKeys.saveStoreLastCleanup, {
        valueEncoding: "json",
      })
      .catch(() => 0);
    if (Date.now() - last < CLEANUP_INTERVAL_MS) return;

    try {
      await cleanUpActiveSaveStore();
      await db.put(levelKeys.saveStoreLastCleanup, Date.now(), {
        valueEncoding: "json",
      });
    } catch (error) {
      logger.warn("Failed to clean up the save store", error);
    }
  }, CLEANUP_STARTUP_DELAY_MS);
};

export const testSaveStore = async (config: SaveStoreConfig) => {
  if (!isUsable(config)) throw new Error("save-store-not-configured");
  await new SelfHostedSaveStore(
    createSaveStoreBackend(config),
    await ensureDeviceId()
  ).test();
};
