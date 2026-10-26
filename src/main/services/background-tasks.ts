import type {
  BackgroundTask,
  BackgroundTaskError,
  BackgroundTaskKind,
} from "@types";

import { describeTaskError } from "./background-task-errors";
import { WindowManager } from "./window-manager";

const CHANGED_EVENT = "on-background-tasks-changed";
const NOTIFY_INTERVAL_MS = 300;

const tasks = new Map<BackgroundTaskKind, BackgroundTask>();
const retryHandlers = new Map<BackgroundTaskKind, () => Promise<unknown>>();
// A dismissed failure is not shown again by scheduled runs until the reason changes.
const dismissedFailures = new Map<BackgroundTaskKind, BackgroundTaskError>();
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
  if (patch.state === "done") dismissedFailures.delete(id);

  tasks.set(id, {
    id,
    state: "running",
    processed: 0,
    total: null,
    result: null,
    dryRun: false,
    ...current,
    error: null,
    ...patch,
    updatedAt: Date.now(),
  });
  notify();
};

/**
 * Marks a task failed with a reason. A scheduled run (`quiet`) that fails the
 * same way as a failure the user already dismissed stays hidden.
 */
export const failBackgroundTask = (
  id: BackgroundTaskKind,
  error: unknown,
  { quiet = false } = {}
) => {
  const reason = describeTaskError(error);

  if (quiet && dismissedFailures.get(id) === reason) {
    removeBackgroundTask(id);
    return reason;
  }

  updateBackgroundTask(id, { state: "failed", error: reason });
  return reason;
};

export const removeBackgroundTask = (id: BackgroundTaskKind) => {
  if (tasks.delete(id)) notify();
};

export const dismissBackgroundTask = (id: BackgroundTaskKind) => {
  const task = tasks.get(id);
  if (task?.state === "failed" && task.error) {
    dismissedFailures.set(id, task.error);
  }
  removeBackgroundTask(id);
};

/** Lets the Downloads page run a failed task again without knowing its service. */
export const registerBackgroundTaskRetry = (
  id: BackgroundTaskKind,
  retry: () => Promise<unknown>
) => {
  retryHandlers.set(id, retry);
};

export const retryBackgroundTask = async (id: BackgroundTaskKind) => {
  const retry = retryHandlers.get(id);
  if (!retry) throw new Error(`No retry for background task ${id}`);

  dismissedFailures.delete(id);
  await retry();
};
