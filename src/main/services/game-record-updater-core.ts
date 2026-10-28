import type { Game } from "@types";

interface GameStore {
  get(gameKey: string): Promise<Game | undefined>;
  put(gameKey: string, game: Game): Promise<unknown>;
}

type GamePatch = Partial<Game> | ((game: Game) => Partial<Game>);

/**
 * Save-store sync keeps the latest edit of a status or wish, so each local
 * change is dated here. A patch that carries its own date (a value adopted
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

  return stamps;
};

export const createGameRecordUpdater = (store: GameStore) => {
  const pendingUpdates = new Map<string, Promise<void>>();

  return async (gameKey: string, patch: GamePatch) => {
    const previousUpdate = pendingUpdates.get(gameKey) ?? Promise.resolve();
    let updatedGame: Game | undefined;

    const update = previousUpdate.then(async () => {
      const game = await store.get(gameKey);
      if (!game || game.isDeleted) return;

      const applied = typeof patch === "function" ? patch(game) : patch;
      updatedGame = { ...game, ...applied, ...stampEdits(game, applied) };

      await store.put(gameKey, updatedGame);
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
