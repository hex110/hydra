export interface FloppyBackfillReport {
  dryRun: boolean;
  total: number;
  created: number;
  updated: number;
  unchanged: number;
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
