import { expandTagFamilies } from "./store-games.js";

export const CATALOGUE_CHART_IDS = [
  "playing-now",
  "most-played",
  "trending",
  "singleplayer",
  "days-30",
  "days-90",
  "top-releases",
  "best-rated",
] as const;

export type CatalogueChartId = (typeof CATALOGUE_CHART_IDS)[number];

export interface CatalogueChartRequest {
  chart: CatalogueChartId;
  /** Top releases: the month's `startOfMonth`; the newest month when left out. */
  month?: number;
}

/** One game on a chart: Steam's store facts plus the chart's own numbers. */
export interface CatalogueChartRow {
  rank: number;
  appId: string;
  title: string;
  headerImageUrl: string | null;
  /** Most voted first, a few. */
  tagIds: number[];
  reviewPercent: number | null;
  reviewCount: number | null;
  releaseYear: number | null;
  isSingleplayer: boolean;
  isEarlyAccess: boolean;
  isFree: boolean;
  /** Players now, or yesterday's peak on the singleplayer chart. */
  players: number | null;
  /** The day's highest number of players. */
  peak: number | null;
  /** Places gained since last week; negative for places lost. */
  places: number | null;
  isNew: boolean;
  /** Days in the top 100 within the window (the 30 and 90 day charts). */
  days: number | null;
}

export type CatalogueChartSource = "steam" | "steamspy" | "hydra";

export interface CatalogueChartResult {
  rows: CatalogueChartRow[];
  /** A source that could not be reached; the chart is empty or partial. */
  failed: CatalogueChartSource | null;
  /** The 30 and 90 day charts before they have enough recorded days. */
  collecting: { since: string | null; days: number; needed: number } | null;
  /** Top releases: the months to pick from, newest first. */
  months: { startOfMonth: number; name: string }[];
  /** Unix milliseconds. */
  updatedAt: number;
}

/** Recorded days a window needs before its chart is more than a start. */
export const CHART_WINDOWS = {
  "days-30": { days: 30, needed: 7 },
  "days-90": { days: 90, needed: 30 },
} as const;

/** The chart's own ranking measure, as the column's header. */
export const CHART_PLAYERS_MEASURE: Partial<
  Record<CatalogueChartId, "now" | "yesterday">
> = {
  "playing-now": "now",
  singleplayer: "yesterday",
};

export type ChartProtonTier = "any" | "silver" | "gold" | "platinum";
export type ChartFreeToPlay = "any" | "only" | "hide";

export interface CatalogueChartFilters {
  /** A game must carry every one of these among its tags. */
  includeTags: number[];
  avoidTags: number[];
  /** Also avoid the tags that mean nearly the same (Idler → Incremental, Clicker). */
  avoidRelated: boolean;
  /** An avoided tag among a game's first this-many tags hides it. */
  avoidDepth: number;
  protondb: ChartProtonTier;
  singleplayerOnly: boolean;
  hideEarlyAccess: boolean;
  freeToPlay: ChartFreeToPlay;
  /** Hides games with fewer Steam reviews (0 for none). */
  minReviews: number;
}

export const DEFAULT_CHART_FILTERS: CatalogueChartFilters = {
  includeTags: [],
  avoidTags: [],
  avoidRelated: true,
  avoidDepth: 5,
  protondb: "any",
  singleplayerOnly: false,
  hideEarlyAccess: false,
  freeToPlay: "any",
  minReviews: 0,
};

const PROTON_ORDER = ["borked", "bronze", "silver", "gold", "platinum"];

/** The chart's rows that pass the filters; a chart is a few hundred games at most, so this is done on all of them. */
export const filterChartRows = (
  rows: CatalogueChartRow[],
  filters: CatalogueChartFilters,
  context: {
    /** ProtonDB tiers by app id, as far as they are known. */
    tiers?: Record<string, string | null>;
    /** App ids to leave out, e.g. games in the library. */
    hidden?: ReadonlySet<string>;
  } = {}
): CatalogueChartRow[] => {
  const avoided = new Set(
    filters.avoidRelated
      ? expandTagFamilies(filters.avoidTags)
      : filters.avoidTags
  );
  const minTier =
    filters.protondb === "any" ? -1 : PROTON_ORDER.indexOf(filters.protondb);

  return rows.filter((row) => {
    if (context.hidden?.has(row.appId)) return false;
    if (filters.singleplayerOnly && !row.isSingleplayer) return false;
    if (filters.hideEarlyAccess && row.isEarlyAccess) return false;
    if (filters.freeToPlay === "only" && !row.isFree) return false;
    if (filters.freeToPlay === "hide" && row.isFree) return false;
    if (filters.minReviews > 0 && (row.reviewCount ?? 0) < filters.minReviews)
      return false;
    if (!filters.includeTags.every((tag) => row.tagIds.includes(tag)))
      return false;
    if (
      avoided.size > 0 &&
      row.tagIds.slice(0, filters.avoidDepth).some((tag) => avoided.has(tag))
    )
      return false;
    if (minTier >= 0) {
      const tier = context.tiers?.[row.appId];
      if (!tier || PROTON_ORDER.indexOf(tier) < minTier) return false;
    }
    return true;
  });
};
