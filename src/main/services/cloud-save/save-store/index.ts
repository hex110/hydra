import { createHash } from "node:crypto";

import { db, levelKeys } from "@main/level";
import type { SaveStoreConfig, UserPreferences } from "@types";

import { createSaveStoreBackend } from "./backends";
import { SelfHostedSaveStore } from "./self-hosted-save-store";

export { isRcloneAvailable } from "./backends";
export {
  SaveStoreConflictError,
  SelfHostedSaveStore,
} from "./self-hosted-save-store";

let active: SelfHostedSaveStore | null = null;
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

export const configureSaveStore = (
  config: SaveStoreConfig | null | undefined
) => {
  const usable = config && isUsable(config) ? config : null;
  active = usable
    ? new SelfHostedSaveStore(createSaveStoreBackend(usable))
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
  configureSaveStore(preferences?.saveStore);
};

export const testSaveStore = async (config: SaveStoreConfig) => {
  if (!isUsable(config)) throw new Error("save-store-not-configured");
  await new SelfHostedSaveStore(createSaveStoreBackend(config)).test();
};
