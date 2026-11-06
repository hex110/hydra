import type {
  BackgroundTask,
  BackgroundTaskError,
  BackgroundTaskKind,
} from "@types";

import { describeTaskError } from "./background-task-errors";
import { WindowManager } from "./window-manager";

const CHANGED_EVENT = "on-background-tasks-changed";
const NOTIFY_INTERVAL_MS = 300;

const tasks = new Map<string, BackgroundTask>();
const retryHandlers = new Map<string, () => Promise<unknown>>();
// A dismissed failure is not shown again by scheduled runs until the reason changes.
const dismissedFailures = new Map<string, BackgroundTaskError>();
let notifyTimer: NodeJS.Timeout | null = null;

export const getBackgroundTasks = () =>
  [...tasks.values()].map((task) => ({
    ...task,
    retryable: retryHandlers.has(task.key),
  }));

// Progress ticks arrive per game; the window only needs a few updates a second.
const notify = () => {
  if (notifyTimer) return;

  notifyTimer = setTimeout(() => {
    notifyTimer = null;
    WindowManager.sendToAppWindows(CHANGED_EVENT, getBackgroundTasks());
  }, NOTIFY_INTERVAL_MS);
};

type TaskPatch = Partial<
  Omit<BackgroundTask, "id" | "key" | "retryable" | "updatedAt">
>;

/** `key` tells entries of one kind apart; it defaults to the kind itself. */
export const updateBackgroundTask = (
  id: BackgroundTaskKind,
  patch: TaskPatch,
  key: string = id
) => {
  const current = tasks.get(key);
  if (patch.state === "done") dismissedFailures.delete(key);

  tasks.set(key, {
    id,
    key,
    retryable: false,
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
  { quiet = false, key = id as string } = {}
) => {
  const reason = describeTaskError(error);

  if (quiet && dismissedFailures.get(key) === reason) {
    removeBackgroundTask(key);
    return reason;
  }

  updateBackgroundTask(id, { state: "failed", error: reason }, key);
  return reason;
};

export const removeBackgroundTask = (key: string) => {
  if (tasks.delete(key)) notify();
};

export const dismissBackgroundTask = (key: string) => {
  const task = tasks.get(key);
  if (task?.state === "failed" && task.error) {
    dismissedFailures.set(key, task.error);
  }
  removeBackgroundTask(key);
};

/** Lets the Downloads page run a failed task again without knowing its service. */
export const registerBackgroundTaskRetry = (
  id: BackgroundTaskKind,
  retry: () => Promise<unknown>,
  key: string = id
) => {
  retryHandlers.set(key, retry);
};

export const retryBackgroundTask = async (key: string) => {
  const retry = retryHandlers.get(key);
  if (!retry) throw new Error(`No retry for background task ${key}`);

  dismissedFailures.delete(key);
  await retry();
};

interface TrackedTaskOptions {
  /** Tells entries of one kind apart; defaults to the kind. */
  key?: string;
  /** Fills the title and the finished text. */
  params?: Record<string, string>;
  /** The page that owns the job. */
  route?: string;
  /** Run again after a failure. */
  retry?: () => Promise<unknown>;
}

/**
 * Reports a job that already has its own progress events to the Downloads
 * page too. `progress` without a total shows an indeterminate bar.
 */
export const trackBackgroundTask = (
  id: BackgroundTaskKind,
  { key = id as string, params, route, retry }: TrackedTaskOptions = {}
) => {
  if (retry) registerBackgroundTaskRetry(id, retry, key);

  return {
    progress: (
      processed: number,
      total: number | null,
      extra?: Record<string, string>
    ) =>
      updateBackgroundTask(
        id,
        {
          state: "running",
          processed,
          total,
          params: { ...params, ...extra },
          route,
        },
        key
      ),
    done: (result: Record<string, number> | null = null) =>
      updateBackgroundTask(
        id,
        { state: "done", result, params, route, processed: 0, total: null },
        key
      ),
    fail: (error: unknown) => {
      failBackgroundTask(id, error, { key });
    },
  };
};
