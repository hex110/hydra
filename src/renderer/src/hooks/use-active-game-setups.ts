import { useSyncExternalStore } from "react";

let activeSetups: ReadonlySet<string> = new Set();
let subscribed = false;
const listeners = new Set<() => void>();

const publish = (next: ReadonlySet<string>) => {
  activeSetups = next;
  listeners.forEach((listener) => listener());
};

const startListening = () => {
  if (subscribed) return;
  subscribed = true;

  window.electron.onGameSetupStatus(({ shop, objectId, status }) => {
    const gameId = `${shop}:${objectId}`;
    const next = new Set(activeSetups);
    if (status === "queued" || status === "running") next.add(gameId);
    else next.delete(gameId);
    publish(next);
  });

  void window.electron
    .getActiveGameSetups()
    .then((gameIds) => publish(new Set([...activeSetups, ...gameIds])))
    .catch(() => {});
};

const subscribe = (listener: () => void) => {
  startListening();
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Game ids (`shop:objectId`) with game setup queued or running. */
export const useActiveGameSetups = () =>
  useSyncExternalStore(subscribe, () => activeSetups);
