import { useSyncExternalStore } from "react";
import type { GameShop, SaveSyncStatus } from "@types";
import { logger } from "@renderer/logger";

/**
 * The last automatic save sync of every game, loaded once and shared by all
 * cards, refreshed whenever a sync finishes.
 */
let statuses = new Map<string, SaveSyncStatus>();
const listeners = new Set<() => void>();
let unsubscribeSync: (() => void) | null = null;

const keyOf = (shop: GameShop, objectId: string) => `${shop}:${objectId}`;

const load = () =>
  window.electron
    .getSaveSyncStatuses()
    .then((list) => {
      statuses = new Map(
        list.map((status) => [keyOf(status.shop, status.objectId), status])
      );
      listeners.forEach((listener) => listener());
    })
    .catch((error) => logger.error("Failed to load save sync", error));

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  if (!unsubscribeSync) {
    void load();
    unsubscribeSync = window.electron.onCloudSaveAutomaticSync((event) => {
      if (event.status !== "progress") void load();
    });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && unsubscribeSync) {
      unsubscribeSync();
      unsubscribeSync = null;
    }
  };
};

/** The game's last automatic save sync, or null when none has run. */
export function useSaveSyncStatus(
  shop: GameShop,
  objectId: string
): SaveSyncStatus | null {
  return useSyncExternalStore(
    subscribe,
    () => statuses.get(keyOf(shop, objectId)) ?? null
  );
}
