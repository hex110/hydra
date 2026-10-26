export type BackgroundTaskKind =
  | "steam-history"
  | "steam-wishlist"
  | "floppy-sync"
  | "floppy-pull"
  | "floppy-import"
  | "floppy-push";

export type BackgroundTaskState = "queued" | "running" | "done" | "failed";

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
  updatedAt: number;
}
