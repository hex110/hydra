import type { Game } from "@types";

import {
  COLLECTIONS_EDIT_KEY,
  localCollectionIds,
  PROFILE_FIELDS,
  sameIdSet,
  sameProfileValue,
} from "./cloud-library-sync/profile-fields.js";

interface GameStore {
  get(gameKey: string): Promise<Game | undefined>;
  put(gameKey: string, game: Game): Promise<unknown>;
}

type GamePatch = Partial<Game> | ((game: Game) => Partial<Game>);

/**
 * Save-store sync keeps the latest edit of a status, wish or profile field, so
 * each local change is dated here. A patch that carries its own date (a value adopted
 * from another device) keeps it.
 */
const stampEdits = (game: Game, patch: Partial<Game>): Partial<Game> => {
  const stamps: Partial<Game> = {};
  const now = new Date().toISOString();

  if (
    "playStatus" in patch &&
    !("playStatusUpdatedAt" in patch) &&
    (patch.playStatus ?? null) !== (game.playStatus ?? null)
  ) {
    stamps.playStatusUpdatedAt = now;
  }
  if (
    "wishlisted" in patch &&
    !("wishlistedUpdatedAt" in patch) &&
    (patch.wishlisted === true) !== (game.wishlisted === true)
  ) {
    stamps.wishlistedUpdatedAt = now;
  }

  if (!("profileEditedAt" in patch)) {
    const edited: string[] = PROFILE_FIELDS.filter(
      (field) => field in patch && !sameProfileValue(patch[field], game[field])
    );
    if (
      "collectionIds" in patch &&
      !sameIdSet(
        localCollectionIds(patch.collectionIds),
        localCollectionIds(game.collectionIds)
      )
    ) {
      edited.push(COLLECTIONS_EDIT_KEY);
    }
    if (edited.length > 0) {
      stamps.profileEditedAt = {
        ...game.profileEditedAt,
        ...Object.fromEntries(edited.map((field) => [field, now])),
      };
    }
  }

  return stamps;
};

export const createGameRecordUpdater = (
  store: GameStore,
  /** Called after a local edit of a synced profile field, to share it with other devices. */
  onProfileEdited?: () => void
) => {
  const pendingUpdates = new Map<string, Promise<void>>();

  return async (gameKey: string, patch: GamePatch) => {
    const previousUpdate = pendingUpdates.get(gameKey) ?? Promise.resolve();
    let updatedGame: Game | undefined;

    const update = previousUpdate.then(async () => {
      const game = await store.get(gameKey);
      if (!game || game.isDeleted) return;

      const applied = typeof patch === "function" ? patch(game) : patch;
      const stamps = stampEdits(game, applied);
      updatedGame = { ...game, ...applied, ...stamps };

      await store.put(gameKey, updatedGame);
      if (stamps.profileEditedAt) onProfileEdited?.();
    });

    const updateTail = update.then(
      () => undefined,
      () => undefined
    );
    pendingUpdates.set(gameKey, updateTail);

    try {
      await update;
      return updatedGame;
    } finally {
      if (pendingUpdates.get(gameKey) === updateTail) {
        pendingUpdates.delete(gameKey);
      }
    }
  };
};
