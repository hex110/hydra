export type BackgroundTaskKind =
  | "steam-history"
  | "steam-wishlist"
  | "floppy-sync"
  | "floppy-pull"
  | "floppy-import"
  | "floppy-push";

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
  id: BackgroundTaskKind;
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
