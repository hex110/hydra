export interface FloppyBackfillReport {
  dryRun: boolean;
  total: number;
  created: number;
  updated: number;
  unchanged: number;
  unmatched: string[];
  failed: number;
}
