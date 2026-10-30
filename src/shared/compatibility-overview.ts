import type {
  CompatibilityOverviewFilter,
  CompatibilityOverviewRow,
} from "@types";

const FAILED_OUTCOMES = new Set(["error", "closed_early", "launch_failed"]);

export const COMPATIBILITY_OVERVIEW_FILTERS: CompatibilityOverviewFilter[] = [
  "all",
  "run_failed",
  "tool_failed",
  "renodx",
  "optiscaler",
  "opted_out",
  "update",
];

export const matchesCompatibilityFilter = (
  row: CompatibilityOverviewRow,
  filter: CompatibilityOverviewFilter
): boolean => {
  switch (filter) {
    case "all":
      return true;
    case "run_failed":
      return !!row.lastRun && FAILED_OUTCOMES.has(row.lastRun.outcome);
    case "tool_failed":
      return !!(row.renodx?.failed || row.optiscaler?.failed);
    case "renodx":
      return !!row.renodx?.installed;
    case "optiscaler":
      return !!row.optiscaler?.installed;
    case "opted_out":
      return [row.onlineFix, row.renodx, row.optiscaler].some(
        (tool) => tool?.mode === "off"
      );
    case "update":
      return row.updateAvailable;
  }
};

export const countCompatibilityFilters = (
  rows: CompatibilityOverviewRow[]
): Record<CompatibilityOverviewFilter, number> =>
  Object.fromEntries(
    COMPATIBILITY_OVERVIEW_FILTERS.map((filter) => [
      filter,
      rows.filter((row) => matchesCompatibilityFilter(row, filter)).length,
    ])
  ) as Record<CompatibilityOverviewFilter, number>;
