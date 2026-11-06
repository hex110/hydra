export type BackgroundTaskKind =
  | "steam-history"
  | "steam-wishlist"
  | "floppy-sync"
  | "floppy-pull"
  | "floppy-import"
  | "floppy-push"
  | "proton-install"
  | "renodx-bulk"
  | "optiscaler-bulk"
  | "save-import-bulk"
  | "game-move"
  | "save-backup"
  | "emulator-install"
  | "retroarch-core-install";

export type BackgroundTaskState = "queued" | "running" | "done" | "failed";

/** Why a task failed, in words the user can act on. */
export type BackgroundTaskError =
  | "unreachable"
  | "unauthorized"
  | "rate-limited"
  | "private-profile"
  | "not-configured"
  | "server"
  | "unknown";

/** A long-running action shown on the Downloads page. */
export interface BackgroundTask {
  /** What kind of job this is; picks its words. */
  id: BackgroundTaskKind;
  /** Unique entry; the same as `id` unless a kind can run several at once. */
  key: string;
  /** Fills the title, e.g. { version: "GE-Proton10-4" }. */
  params?: Record<string, string>;
  /** A retry handler is registered, so failed entries can run again. */
  retryable: boolean;
  /** The page that owns the job, opened from the row's menu. */
  route?: string;
  state: BackgroundTaskState;
  /** Games handled so far, and in all (null while unknown or for a queue). */
  processed: number;
  total: number | null;
  /** Numbers for the finished message, e.g. { added: 12 }. */
  result: Record<string, number> | null;
  /** A preview writes nothing. */
  dryRun: boolean;
  /** Set when `state` is "failed". */
  error: BackgroundTaskError | null;
  updatedAt: number;
}

/** A library import whose entries can be removed again. */
export type LibraryImportSource = "steam-history" | "steam-wishlist" | "floppy";

export type IntegrationName =
  | "steamHistory"
  | "steamWishlist"
  | "floppy"
  | "cloud";

export interface IntegrationStatus {
  /** Epoch milliseconds of the last run that finished. */
  lastSyncedAt: number | null;
  /** Why the latest run failed; cleared by the next one that succeeds. */
  lastError: BackgroundTaskError | null;
}

export type IntegrationStatuses = Record<IntegrationName, IntegrationStatus>;
