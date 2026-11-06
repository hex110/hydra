import { useSyncExternalStore } from "react";
import type { BackgroundTask } from "@types";
import { logger } from "@renderer/logger";

interface Snapshot {
  tasks: BackgroundTask[];
  loaded: boolean;
}

let snapshot: Snapshot = { tasks: [], loaded: false };
const listeners = new Set<() => void>();
let unsubscribeFromMain: (() => void) | null = null;

const publish = (next: Snapshot) => {
  snapshot = next;
  for (const listener of listeners) listener();
};

// One subscription to the main process for the page and the bottom bar.
const connect = () => {
  unsubscribeFromMain = window.electron.onBackgroundTasksChanged((tasks) =>
    publish({ tasks, loaded: true })
  );
  window.electron
    .getBackgroundTasks()
    .then((tasks) => publish({ tasks, loaded: true }))
    .catch((error) => {
      logger.error("Failed to load background tasks", error);
      publish({ ...snapshot, loaded: true });
    });
};

const subscribe = (listener: () => void) => {
  if (listeners.size === 0) connect();
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      unsubscribeFromMain?.();
      unsubscribeFromMain = null;
    }
  };
};

/** Long-running jobs the main process reports, live. */
export function useBackgroundTasks() {
  return useSyncExternalStore(subscribe, () => snapshot);
}
