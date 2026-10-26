import type { BackgroundTask, BackgroundTaskKind } from "@types";

import { WindowManager } from "./window-manager";

const CHANGED_EVENT = "on-background-tasks-changed";
const NOTIFY_INTERVAL_MS = 300;

const tasks = new Map<BackgroundTaskKind, BackgroundTask>();
let notifyTimer: NodeJS.Timeout | null = null;

export const getBackgroundTasks = () => [...tasks.values()];

// Progress ticks arrive per game; the window only needs a few updates a second.
const notify = () => {
  if (notifyTimer) return;

  notifyTimer = setTimeout(() => {
    notifyTimer = null;
    WindowManager.sendToAppWindows(CHANGED_EVENT, getBackgroundTasks());
  }, NOTIFY_INTERVAL_MS);
};

export const updateBackgroundTask = (
  id: BackgroundTaskKind,
  patch: Partial<Omit<BackgroundTask, "id" | "updatedAt">>
) => {
  const current = tasks.get(id);

  tasks.set(id, {
    id,
    state: "running",
    processed: 0,
    total: null,
    result: null,
    dryRun: false,
    ...current,
    ...patch,
    updatedAt: Date.now(),
  });
  notify();
};

export const removeBackgroundTask = (id: BackgroundTaskKind) => {
  if (tasks.delete(id)) notify();
};
