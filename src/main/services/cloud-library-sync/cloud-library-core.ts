import type { Game, PlayStatus } from "@types";

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
}

export interface DeviceState {
  version: 1;
  deviceId: string;
  hostname: string | null;
  platform: string | null;
  updatedAt: string;
  /** Keyed `shop:objectId`. */
  games: Record<string, DeviceGameState>;
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

export const buildDeviceGames = (
  games: SyncedGame[]
): Record<string, DeviceGameState> => {
  const states: Record<string, DeviceGameState> = {};

  for (const game of games) {
    if (!isSyncable(game)) continue;
    const playTime = Math.max(0, Math.trunc(game.playTimeInMilliseconds ?? 0));
    const hasStatus = game.playStatus != null || !!game.playStatusUpdatedAt;
    const hasWish = game.wishlisted === true || !!game.wishlistedUpdatedAt;
    if (playTime === 0 && !hasStatus && !hasWish) continue;

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
    >
  > & { wishlistOnly: boolean };

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
  | { kind: "dropWishlist"; key: string; stamp: string; deleteEntry: boolean };

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

/**
 * What to change here so this device agrees with the others: playtime adds
 * up, the most recent edit wins for status and wishlist. A device that has
 * never touched a field says nothing about it.
 */
export const planMerge = (
  locals: Map<string, LocalGameView>,
  others: DeviceState[]
): MergeAction[] => {
  const keys = new Set<string>();
  for (const other of others) {
    for (const key of Object.keys(other.games)) keys.add(key);
  }

  const actions: MergeAction[] = [];

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

    if (Object.keys(patch).length > 0) {
      actions.push({ kind: "patch", key, patch });
    }
  }

  return actions;
};
