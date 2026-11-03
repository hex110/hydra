import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { NotInterestedGame } from "@shared";
import { logger } from "@renderer/logger";

interface Identity {
  shop: string;
  objectId: string;
  title: string;
}

interface Snapshot {
  games: NotInterestedGame[];
  keys: ReadonlySet<string>;
  /** The game just hidden, for the Undo bar. */
  last: Identity | null;
}

const toKeys = (games: NotInterestedGame[]) =>
  new Set(games.map((game) => `${game.shop}:${game.objectId}`));

let snapshot: Snapshot = { games: [], keys: new Set(), last: null };
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

const publish = (next: Snapshot) => {
  snapshot = next;
  for (const listener of listeners) listener();
};

const load = () => {
  loading ??= window.electron
    .getNotInterested()
    .then((games) => publish({ ...snapshot, games, keys: toKeys(games) }))
    .catch((error) => logger.error("Failed to load Not interested", error));
  return loading;
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const hide = (game: Identity) => {
  const games = [
    { ...game, at: Date.now() },
    ...snapshot.games.filter(
      (item) => item.shop !== game.shop || item.objectId !== game.objectId
    ),
  ];
  publish({ games, keys: toKeys(games), last: game });
  window.electron
    .setNotInterested(game, true)
    .catch((error) => logger.error("Failed to hide a game", error));
};

const restore = (game: Pick<Identity, "shop" | "objectId" | "title">) => {
  const games = snapshot.games.filter(
    (item) => item.shop !== game.shop || item.objectId !== game.objectId
  );
  const last =
    snapshot.last?.shop === game.shop &&
    snapshot.last.objectId === game.objectId
      ? null
      : snapshot.last;
  publish({ games, keys: toKeys(games), last });
  window.electron
    .setNotInterested(game, false)
    .catch((error) => logger.error("Failed to restore a game", error));
};

/** Games the person does not want suggested, shared by every shelf. */
export function useNotInterested() {
  const { games, keys, last } = useSyncExternalStore(subscribe, () => snapshot);

  useEffect(() => {
    void load();
  }, []);

  const dismissLast = useCallback(
    () => publish({ ...snapshot, last: null }),
    []
  );

  return {
    games,
    keys,
    last,
    markNotInterested: hide,
    restore,
    dismissLast,
  };
}
