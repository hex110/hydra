import type { SaveSyncStatus } from "@types";

export interface SaveSyncSummary {
  /** The newest successful automatic backup of any game. */
  lastBackupAt: string | null;
  /** Games whose last automatic sync failed or hit a conflict, newest first. */
  failing: SaveSyncStatus[];
}

export const summarizeSaveSync = (
  statuses: SaveSyncStatus[]
): SaveSyncSummary => ({
  lastBackupAt:
    statuses
      .map((status) => status.lastSuccessAt)
      .filter((at): at is string => Boolean(at))
      .toSorted()
      .at(-1) ?? null,
  failing: statuses
    .filter((status) => status.status !== "completed")
    .toSorted((a, b) => b.at.localeCompare(a.at)),
});
