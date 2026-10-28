import type {
  Game,
  LocalCollection,
  PlayStatus,
  SavedLibraryFilter,
  UnlockedAchievement,
} from "@types";

import {
  COLLECTIONS_EDIT_KEY,
  hasProfileValue,
  LEGACY_EDIT_STAMP,
  localCollectionIds,
  PROFILE_FIELDS,
  sameIdSet,
  sameProfileValue,
  type ProfileEditKey,
  type ProfileField,
  type ProfileValues,
} from "./profile-fields.js";

/** What one device knows about one game, as it writes it to the store. */
export interface DeviceGameState {
  title: string;
  platform?: string | null;
  /** Only what this device tracked itself; the total is every device added up. */
  playTimeInMilliseconds?: number;
  lastTimePlayed?: string | null;
  playStatus?: PlayStatus | null;
  playStatusUpdatedAt?: string;
  wishlisted?: boolean;
  wishlistedUpdatedAt?: string;
  /** Notes, rating and the other profile fields, each dated by its own edit. */
  profile?: Partial<ProfileValues>;
  profileEditedAt?: Partial<Record<ProfileEditKey, string>>;
  /** Ids of the local collections the game is in. */
  collections?: string[];
  achievements?: SyncedAchievement[];
}

/** A collection kept on the user's devices, as published; deleted ones stay as a marker. */
export interface SyncedCollection {
  name: string;
  createdAt: string;
  savedFilter?: SavedLibraryFilter | null;
  updatedAt: string;
  deleted?: boolean;
}

export type SyncedAchievement = Pick<
  UnlockedAchievement,
  "name" | "unlockTime" | "hardcoreUnlockTime"
>;

export interface DeviceState {
  version: 1;
  deviceId: string;
  hostname: string | null;
  platform: string | null;
  updatedAt: string;
  /** Keyed `shop:objectId`. */
  games: Record<string, DeviceGameState>;
  /** Keyed by collection id. */
  collections?: Record<string, SyncedCollection>;
}

type SyncedGame = Pick<Game, "shop" | "objectId" | "title" | "isDeleted"> &
  Partial<
    Pick<
      Game,
      | "playTimeInMilliseconds"
      | "lastTimePlayed"
      | "playStatus"
      | "playStatusUpdatedAt"
      | "wishlisted"
      | "wishlistedUpdatedAt"
      | "profileEditedAt"
      | "collectionIds"
      | ProfileField
    >
  > & { platform?: string | null };

export const gameKey = (game: Pick<Game, "shop" | "objectId">) =>
  `${game.shop}:${game.objectId}`;

const toMs = (value: string | Date | null | undefined) => {
  if (!value) return 0;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
};

const toIso = (value: string | Date | null | undefined) => {
  const ms = toMs(value);
  return ms > 0 ? new Date(ms).toISOString() : null;
};

/** Games that only exist on this machine have nothing to sync. */
const isSyncable = (game: Pick<Game, "shop">) => game.shop !== "custom";

/** The profile fields this game has a value for or has edited, with their dates. */
const buildProfile = (game: SyncedGame) => {
  const profile: Partial<ProfileValues> = {};
  const editedAt: Partial<Record<ProfileEditKey, string>> = {};

  for (const field of PROFILE_FIELDS) {
    const stamp = game.profileEditedAt?.[field];
    if (!stamp && !hasProfileValue(game[field])) continue;
    Object.assign(profile, { [field]: game[field] ?? null });
    editedAt[field] = stamp ?? LEGACY_EDIT_STAMP;
  }

  const collections = localCollectionIds(game.collectionIds);
  const collectionsStamp = game.profileEditedAt?.[COLLECTIONS_EDIT_KEY];
  if (collectionsStamp || collections.length > 0) {
    editedAt[COLLECTIONS_EDIT_KEY] = collectionsStamp ?? LEGACY_EDIT_STAMP;
  }

  return Object.keys(editedAt).length > 0
    ? { profile, editedAt, collections }
    : null;
};

/** Unlocks are never taken back, so the newest list can only add to an older one. */
export const unionAchievements = (
  ...lists: (SyncedAchievement[] | undefined)[]
): SyncedAchievement[] => {
  const byName = new Map<string, SyncedAchievement>();

  for (const achievement of lists.flatMap((list) => list ?? [])) {
    const name = achievement.name.toUpperCase();
    const known = byName.get(name);
    if (!known || achievement.unlockTime < known.unlockTime) {
      byName.set(name, {
        name,
        unlockTime: achievement.unlockTime,
        ...(achievement.hardcoreUnlockTime != null && {
          hardcoreUnlockTime: achievement.hardcoreUnlockTime,
        }),
      });
    }
  }

  return [...byName.values()];
};

export const buildDeviceGames = (
  games: SyncedGame[],
  achievements: Map<string, SyncedAchievement[]> = new Map()
): Record<string, DeviceGameState> => {
  const states: Record<string, DeviceGameState> = {};

  for (const game of games) {
    if (!isSyncable(game)) continue;
    const playTime = Math.max(0, Math.trunc(game.playTimeInMilliseconds ?? 0));
    const hasStatus = game.playStatus != null || !!game.playStatusUpdatedAt;
    const hasWish = game.wishlisted === true || !!game.wishlistedUpdatedAt;
    const profile = buildProfile(game);
    const unlocked = achievements.get(gameKey(game)) ?? [];
    if (
      playTime === 0 &&
      !hasStatus &&
      !hasWish &&
      !profile &&
      unlocked.length === 0
    ) {
      continue;
    }

    states[gameKey(game)] = {
      title: game.title,
      platform: game.platform ?? null,
      ...(playTime > 0 && {
        playTimeInMilliseconds: playTime,
        lastTimePlayed: toIso(game.lastTimePlayed),
      }),
      ...(hasStatus && {
        playStatus: game.playStatus ?? null,
        playStatusUpdatedAt: game.playStatusUpdatedAt,
      }),
      ...(hasWish && {
        wishlisted: game.wishlisted === true,
        wishlistedUpdatedAt: game.wishlistedUpdatedAt,
      }),
      ...(profile && {
        profile: profile.profile,
        profileEditedAt: profile.editedAt,
        collections: profile.collections,
      }),
      ...(unlocked.length > 0 && { achievements: unionAchievements(unlocked) }),
    };
  }

  return states;
};

/** The local side of the merge: a game and whether it is only a wish. */
export type LocalGameView = Pick<
  Game,
  "shop" | "objectId" | "title" | "isDeleted"
> &
  Partial<
    Pick<
      Game,
      | "lastTimePlayed"
      | "playStatus"
      | "playStatusUpdatedAt"
      | "wishlisted"
      | "wishlistedUpdatedAt"
      | "syncedPlayTimeInMilliseconds"
      | "profileEditedAt"
      | "collectionIds"
      | ProfileField
    >
  > & {
    wishlistOnly: boolean;
    /** Upper-cased names; left out until this device has read its achievements. */
    unlockedAchievementNames?: string[];
  };

export type MergeAction =
  | { kind: "patch"; key: string; patch: Partial<Game> }
  | {
      kind: "createWishlist";
      shop: Game["shop"];
      objectId: string;
      title: string;
      platform: string | null;
      stamp: string;
    }
  | { kind: "dropWishlist"; key: string; stamp: string; deleteEntry: boolean }
  | { kind: "achievements"; key: string; achievements: SyncedAchievement[] }
  | { kind: "collection"; id: string; collection: SyncedCollection };

interface Latest<T> {
  value: T;
  at: number;
  stamp: string | undefined;
}

const newest = <T>(
  current: Latest<T>,
  value: T,
  stamp: string | undefined
): Latest<T> => {
  const at = toMs(stamp);
  return at > current.at ? { value, at, stamp } : current;
};

const splitKey = (key: string) => {
  const index = key.indexOf(":");
  return {
    shop: key.slice(0, index) as Game["shop"],
    objectId: key.slice(index + 1),
  };
};

/** The profile fields where another device's latest edit beats this one's. */
const mergeProfile = (
  local: LocalGameView,
  others: DeviceGameState[]
): Partial<Game> | null => {
  const values: Record<string, unknown> = {};
  const stamps: Record<string, string> = {};

  for (const field of PROFILE_FIELDS) {
    const stamp = local.profileEditedAt?.[field];
    let winner: Latest<unknown> = {
      value: local[field],
      at: stamp
        ? toMs(stamp)
        : hasProfileValue(local[field])
          ? toMs(LEGACY_EDIT_STAMP)
          : 0,
      stamp,
    };

    for (const other of others) {
      const otherStamp = other.profileEditedAt?.[field];
      if (otherStamp && field in (other.profile ?? {})) {
        winner = newest(winner, other.profile?.[field], otherStamp);
      }
    }

    if (!sameProfileValue(winner.value, local[field])) {
      values[field] = winner.value ?? null;
      stamps[field] = winner.stamp!;
    }
  }

  if (Object.keys(stamps).length === 0) return null;
  return {
    ...values,
    profileEditedAt: { ...local.profileEditedAt, ...stamps },
  } as Partial<Game>;
};

/** The collections this device has, deleted ones included, as published. */
export const buildDeviceCollections = (
  records: LocalCollection[]
): Record<string, SyncedCollection> =>
  Object.fromEntries(
    records.map((record) => [
      record.id,
      {
        name: record.name,
        createdAt: record.createdAt,
        savedFilter: record.savedFilter ?? null,
        updatedAt: record.updatedAt ?? record.createdAt,
        ...(record.deleted && { deleted: true }),
      },
    ])
  );

const normalizeName = (name: string) => name.trim().toLocaleLowerCase();

export interface CollectionPlan {
  actions: Extract<MergeAction, { kind: "collection" }>[];
  /** The id a collection has on this device after the plan; null when it is gone. */
  resolve: (id: string) => string | null;
}

/**
 * Collections follow the newest change to each id (create, rename, delete). A
 * collection another device made with the name of one that exists here is the
 * same collection: games map onto this one and no second copy is made.
 */
export const planCollections = (
  local: Map<string, SyncedCollection>,
  others: DeviceState[]
): CollectionPlan => {
  const merged = new Map(local);
  for (const other of others) {
    for (const [id, collection] of Object.entries(other.collections ?? {})) {
      const known = merged.get(id);
      if (!known || toMs(collection.updatedAt) > toMs(known.updatedAt)) {
        merged.set(id, collection);
      }
    }
  }

  const existsHere = (id: string) => {
    const here = local.get(id);
    return Boolean(here && !here.deleted);
  };

  // Which id stands for a name: one that exists here first, then the smallest.
  const live = [...merged]
    .filter(([, collection]) => !collection.deleted)
    .sort(
      ([a], [b]) =>
        Number(!existsHere(a)) - Number(!existsHere(b)) || a.localeCompare(b)
    );
  const byName = new Map<string, string>();
  for (const [id, collection] of live) {
    const name = normalizeName(collection.name);
    if (!byName.has(name)) byName.set(name, id);
  }

  const resolve = (id: string) => {
    const collection = merged.get(id);
    if (!collection || collection.deleted) return null;
    return existsHere(id)
      ? id
      : (byName.get(normalizeName(collection.name)) ?? id);
  };

  const actions: CollectionPlan["actions"] = [];
  for (const [id, collection] of merged) {
    const here = local.get(id);
    if (here === collection) continue;
    if (!here && collection.deleted) continue;
    if (!here && resolve(id) !== id) continue;
    actions.push({ kind: "collection", id, collection });
  }

  return { actions, resolve };
};

/** Which collections a game is in: the newest edit wins, as for a profile field. */
const mergeMembership = (
  local: LocalGameView,
  states: DeviceGameState[],
  resolve: CollectionPlan["resolve"]
): { ids: string[]; stamp: string | undefined } | null => {
  const here = localCollectionIds(local.collectionIds);
  const stamp = local.profileEditedAt?.[COLLECTIONS_EDIT_KEY];
  let winner: Latest<string[]> = {
    value: here,
    at: stamp ? toMs(stamp) : here.length > 0 ? toMs(LEGACY_EDIT_STAMP) : 0,
    stamp,
  };

  for (const state of states) {
    const otherStamp = state.profileEditedAt?.[COLLECTIONS_EDIT_KEY];
    if (otherStamp && state.collections) {
      winner = newest(winner, state.collections, otherStamp);
    }
  }

  const ids = [
    ...new Set(
      winner.value.flatMap((id) => {
        const resolved = resolve(id);
        return resolved === null ? [] : [resolved];
      })
    ),
  ];
  if (sameIdSet(ids, here)) return null;

  return {
    ids: [
      ...(local.collectionIds ?? []).filter((id) => !here.includes(id)),
      ...ids,
    ],
    stamp: winner.stamp,
  };
};

/** Unlocks other devices have that this one has not read yet. */
const missingAchievements = (
  local: LocalGameView,
  others: DeviceGameState[]
): SyncedAchievement[] => {
  if (!local.unlockedAchievementNames) return [];
  const known = new Set(local.unlockedAchievementNames);
  return unionAchievements(...others.map((other) => other.achievements)).filter(
    (achievement) => !known.has(achievement.name)
  );
};

/**
 * What to change here so this device agrees with the others: playtime adds
 * up, the most recent edit wins for status, wishlist and each profile field,
 * and unlocked achievements are added. A device that has never touched a
 * field says nothing about it.
 */
export const planMerge = (
  locals: Map<string, LocalGameView>,
  others: DeviceState[],
  localCollections: Map<string, SyncedCollection> = new Map()
): MergeAction[] => {
  const keys = new Set<string>();
  for (const other of others) {
    for (const key of Object.keys(other.games)) keys.add(key);
  }

  const collectionPlan = planCollections(localCollections, others);
  const actions: MergeAction[] = [...collectionPlan.actions];

  for (const key of keys) {
    const local = locals.get(key);
    const { shop, objectId } = splitKey(key);
    if (!isSyncable({ shop })) continue;

    let playTime = 0;
    let lastPlayed = 0;
    let status: Latest<PlayStatus | null> = {
      value: local?.playStatus ?? null,
      at: toMs(local?.playStatusUpdatedAt),
      stamp: local?.playStatusUpdatedAt,
    };
    let wish: Latest<boolean> = {
      value: local?.wishlisted === true,
      at: toMs(local?.wishlistedUpdatedAt),
      stamp: local?.wishlistedUpdatedAt,
    };
    let title: string | null = null;
    let platform: string | null = null;

    for (const other of others) {
      const state = other.games[key];
      if (!state) continue;
      playTime += Math.max(0, state.playTimeInMilliseconds ?? 0);
      lastPlayed = Math.max(lastPlayed, toMs(state.lastTimePlayed));
      title ??= state.title;
      platform ??= state.platform ?? null;
      if (state.playStatusUpdatedAt) {
        status = newest(
          status,
          state.playStatus ?? null,
          state.playStatusUpdatedAt
        );
      }
      if (state.wishlistedUpdatedAt) {
        wish = newest(
          wish,
          state.wishlisted === true,
          state.wishlistedUpdatedAt
        );
      }
    }

    const wishChanged = wish.value !== (local?.wishlisted === true);

    if (!local || local.isDeleted) {
      if (wishChanged && wish.value && title) {
        actions.push({
          kind: "createWishlist",
          shop,
          objectId,
          title,
          platform,
          stamp: wish.stamp!,
        });
      }
      continue;
    }

    const patch: Partial<Game> = {};
    if (!local.wishlistOnly) {
      const synced = Math.trunc(playTime);
      if (synced !== (local.syncedPlayTimeInMilliseconds ?? 0)) {
        patch.syncedPlayTimeInMilliseconds = synced;
      }
      if (lastPlayed > toMs(local.lastTimePlayed)) {
        patch.lastTimePlayed = new Date(lastPlayed);
      }
    }
    if (status.value !== (local.playStatus ?? null)) {
      patch.playStatus = status.value;
      patch.playStatusUpdatedAt = status.stamp;
    }

    if (wishChanged && !wish.value && local.wishlistOnly) {
      actions.push({
        kind: "dropWishlist",
        key,
        stamp: wish.stamp!,
        deleteEntry: true,
      });
    } else if (wishChanged) {
      patch.wishlisted = wish.value;
      patch.wishlistedUpdatedAt = wish.stamp;
    }

    const states = others.flatMap((other) =>
      other.games[key] ? [other.games[key]] : []
    );
    Object.assign(patch, mergeProfile(local, states));

    const membership = mergeMembership(local, states, collectionPlan.resolve);
    if (membership) {
      patch.collectionIds = membership.ids;
      if (membership.stamp) {
        patch.profileEditedAt = {
          ...(patch.profileEditedAt ?? local.profileEditedAt),
          [COLLECTIONS_EDIT_KEY]: membership.stamp,
        };
      }
    }

    if (Object.keys(patch).length > 0) {
      actions.push({ kind: "patch", key, patch });
    }

    if (!local.wishlistOnly && local.shop !== "epic") {
      const achievements = missingAchievements(local, states);
      if (achievements.length > 0) {
        actions.push({ kind: "achievements", key, achievements });
      }
    }
  }

  return actions;
};

/** One game of a device's library, as uploaded. Imported only on request. */
export interface LibraryEntry {
  shop: Game["shop"];
  objectId: string;
  title: string;
  platform: string | null;
  addedToLibraryAt: string | null;
}

export interface LibraryState {
  version: 1;
  deviceId: string;
  hostname: string | null;
  updatedAt: string;
  games: LibraryEntry[];
}

export type LibrarySourceGame = Pick<
  Game,
  "shop" | "objectId" | "title" | "isDeleted" | "platform" | "addedToLibraryAt"
> & { wishlistOnly: boolean };

/** The games in this library: what was removed, only wished for or custom is left out. */
export const buildLibraryEntries = (
  games: LibrarySourceGame[]
): LibraryEntry[] =>
  games
    .filter((game) => isSyncable(game) && !game.isDeleted && !game.wishlistOnly)
    .map((game) => ({
      shop: game.shop,
      objectId: game.objectId,
      title: game.title,
      platform: game.platform ?? null,
      addedToLibraryAt: toIso(game.addedToLibraryAt),
    }))
    .sort((a, b) => a.title.localeCompare(b.title));

/**
 * The games the chosen devices have that this library lacks, once each. A game
 * this device removed on purpose is offered again: importing is the user's ask.
 */
export const planLibraryImport = (
  localKeys: Set<string>,
  libraries: LibraryState[]
): LibraryEntry[] => {
  const missing = new Map<string, LibraryEntry>();

  for (const library of libraries) {
    for (const entry of library.games) {
      const key = gameKey(entry);
      if (localKeys.has(key) || !isSyncable(entry)) continue;
      const known = missing.get(key);
      if (
        !known ||
        (entry.addedToLibraryAt &&
          (!known.addedToLibraryAt ||
            entry.addedToLibraryAt < known.addedToLibraryAt))
      ) {
        missing.set(key, entry);
      }
    }
  }

  return [...missing.values()].sort((a, b) => a.title.localeCompare(b.title));
};
