import type { GameShop } from "@types";

/** How long Play waits for the cloud before it starts the game with local saves. */
export const PRE_LAUNCH_SYNC_MAX_WAIT_MS = 20_000;
const POLL_MS = 500;

const abandoned = new Set<string>();

const keyOf = (objectId: string, shop: GameShop) => `${shop}:${objectId}`;

export const clearAbandonedPreLaunchSync = (
  objectId: string,
  shop: GameShop
) => {
  abandoned.delete(keyOf(objectId, shop));
};

/** A sync Play stopped waiting for must not touch the saves once the game runs. */
export const isPreLaunchSyncAbandoned = (objectId: string, shop: GameShop) =>
  abandoned.has(keyOf(objectId, shop));

/**
 * Resolves with the sync's outcome, or with `onGiveUp()` after `maxWaitMs`.
 * It never gives up while the sync is restoring: a half-restored save is worse
 * than a slow start.
 */
export const waitForPreLaunchSync = <T>(
  sync: Promise<T>,
  options: {
    objectId: string;
    shop: GameShop;
    getStage: () => string | undefined;
    onGiveUp: () => T;
    maxWaitMs?: number;
    pollMs?: number;
  }
): Promise<T> => {
  const maxWaitMs = options.maxWaitMs ?? PRE_LAUNCH_SYNC_MAX_WAIT_MS;
  const startedAt = Date.now();

  return new Promise<T>((resolve, reject) => {
    const timer = setInterval(() => {
      if (
        Date.now() - startedAt < maxWaitMs ||
        options.getStage() === "restoring"
      ) {
        return;
      }
      clearInterval(timer);
      abandoned.add(keyOf(options.objectId, options.shop));
      resolve(options.onGiveUp());
    }, options.pollMs ?? POLL_MS);

    sync.then(
      (value) => {
        clearInterval(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearInterval(timer);
        reject(error);
      }
    );
  });
};
