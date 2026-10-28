import { randomUUID } from "node:crypto";
import {
  gamesSublevel,
  levelKeys,
  localCollectionsSublevel,
} from "@main/level";
import {
  getRemoteCollectionIds,
  LOCAL_COLLECTION_PREFIX,
  replaceCollectionId,
} from "@shared";
import type {
  Game,
  GameCollection,
  LocalCollection,
  SavedLibraryFilter,
} from "@types";
import { updateGameRecord } from "./game-record-updater";
import { HydraApi } from "./hydra-api";
import { createGame } from "./library-sync";
import { logger } from "./logger";

const isGameNotFoundError = (error: unknown) => {
  if (typeof error !== "object" || error === null) return false;

  const response = (error as { response?: { data?: { message?: unknown } } })
    .response;

  return response?.data?.message === "game/not-found";
};

const normalizeName = (name: string) => name.trim().toLocaleLowerCase();

/**
 * Stores a game's collections and, when signed in, sends the account ones to
 * Hydra. Local collection ids never leave this machine.
 */
export const assignGameCollections = async (
  game: Game,
  collectionIds: string[]
) => {
  if (game.shop !== "custom" && HydraApi.isLoggedIn()) {
    const syncCollection = () =>
      HydraApi.put(`/profile/games/${game.shop}/${game.objectId}/collection`, {
        collectionIds: getRemoteCollectionIds(collectionIds),
      });

    try {
      await syncCollection();
    } catch (error) {
      if (!isGameNotFoundError(error)) throw error;

      await createGame(game);
      await syncCollection();
    }
  }

  await updateGameRecord(levelKeys.game(game.shop, game.objectId), {
    collectionIds,
  });
};

const gamesInCollection = async (id: string) =>
  (await gamesSublevel.values().all()).filter(
    (game) => !game.isDeleted && game.collectionIds?.includes(id)
  );

/** Kept as a marker, so cloud sync does not bring it back from another device. */
const markDeleted = async (id: string) => {
  const collection = await localCollectionsSublevel.get(id);
  if (!collection) return;
  await localCollectionsSublevel.put(id, {
    ...collection,
    deleted: true,
    updatedAt: new Date().toISOString(),
  });
};

export const LocalCollections = {
  async list(): Promise<GameCollection[]> {
    const collections = (await localCollectionsSublevel.values().all()).filter(
      (collection) => !collection.deleted
    );
    return collections.map((collection) => ({
      id: collection.id,
      name: collection.name,
      gamesCount: 0,
      savedFilter: collection.savedFilter ?? null,
    }));
  },

  async create(
    name: string,
    savedFilter: SavedLibraryFilter | null = null
  ): Promise<GameCollection> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("game/collection-name-required");

    const existing = (await localCollectionsSublevel.values().all()).filter(
      (collection) => !collection.deleted
    );
    if (
      existing.some(
        (collection) => normalizeName(collection.name) === normalizeName(name)
      )
    ) {
      throw new Error("game/collection-name-already-in-use");
    }

    const now = new Date().toISOString();
    const collection: LocalCollection = {
      id: `${LOCAL_COLLECTION_PREFIX}${randomUUID()}`,
      name: trimmed,
      createdAt: now,
      updatedAt: now,
      savedFilter,
    };
    await localCollectionsSublevel.put(collection.id, collection);

    return { ...collection, gamesCount: 0 };
  },

  async rename(id: string, name: string) {
    const collection = await localCollectionsSublevel.get(id);
    if (!collection) throw new Error("game/collection-not-found");

    await localCollectionsSublevel.put(id, {
      ...collection,
      name: name.trim(),
      updatedAt: new Date().toISOString(),
    });
  },

  async delete(id: string) {
    for (const game of await gamesInCollection(id)) {
      await updateGameRecord(levelKeys.game(game.shop, game.objectId), {
        collectionIds: (game.collectionIds ?? []).filter(
          (collectionId) => collectionId !== id
        ),
      });
    }

    await markDeleted(id);
  },

  /**
   * Turns local collections into account collections once signed in: an
   * account collection with the same name is reused, otherwise one is
   * created. Saved filters stay local, since Hydra has no field for them.
   */
  async syncToAccount(): Promise<number> {
    if (!HydraApi.isLoggedIn()) return 0;

    const locals = (await localCollectionsSublevel.values().all()).filter(
      (collection) => !collection.savedFilter && !collection.deleted
    );
    if (locals.length === 0) return 0;

    const remote = await HydraApi.get<GameCollection[]>(
      "/profile/games/collections"
    );
    const remoteByName = new Map(
      (Array.isArray(remote) ? remote : []).map((collection) => [
        normalizeName(collection.name),
        collection,
      ])
    );

    let synced = 0;
    for (const local of locals) {
      try {
        const target =
          remoteByName.get(normalizeName(local.name)) ??
          (await HydraApi.post<GameCollection>("/profile/games/collections", {
            name: local.name,
          }));

        for (const game of await gamesInCollection(local.id)) {
          await assignGameCollections(
            game,
            replaceCollectionId(game.collectionIds ?? [], local.id, target.id)
          );
        }

        await markDeleted(local.id);
        synced++;
      } catch (error) {
        logger.error(`Failed to sync local collection ${local.name}`, error);
      }
    }

    return synced;
  },
};
