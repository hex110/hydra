export interface FloppyGameChange {
  title: string;
  action: "create" | "update";
  /** Floppy status codes: 0 Planning, 1 In progress, 2 Paused, 3 Completed, 4 Dropped. */
  fromStatus: number | null;
  toStatus: number | null;
  fromMinutes: number;
  toMinutes: number;
}

export interface FloppyBackfillReport {
  dryRun: boolean;
  total: number;
  created: number;
  updated: number;
  unchanged: number;
  changes: FloppyGameChange[];
  unmatched: string[];
  failed: number;
}

export interface FloppySyncStatus {
  running: boolean;
  dryRun: boolean;
  total: number;
  processed: number;
  report: FloppyBackfillReport | null;
  error: string | null;
}

export interface FloppyPullResult {
  total: number;
  matched: number;
  updated: number;
  /** Library games created from Floppy-only entries by this pull. */
  added: number;
  /** Existing library games linked to a Floppy entry by the catalogue. */
  linked: number;
  /** Floppy-only games the catalogue could not match. */
  unmatched: FloppyUnmatchedGame[];
}

export interface FloppySearchResult {
  media_id: string | number;
  title: string;
  year?: number | null;
  platforms?: string[];
}

export interface FloppyUnmatchedGame {
  mediaId: string;
  title: string;
  image: string | null;
}
