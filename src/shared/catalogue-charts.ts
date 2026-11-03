import { expandTagFamilies } from "./store-games.js";

export const CATALOGUE_CHART_IDS = [
  "playing-now",
  "most-played",
  "trending",
  "days-30",
  "days-90",
  "best-rated",
  "most-reviewed",
  "most-anticipated",
] as const;

export type CatalogueChartId = (typeof CATALOGUE_CHART_IDS)[number];

/** Charts that rank released games by the store's own figures, so the period picks the games fetched. */
export const STORE_RANKED_CHARTS: readonly CatalogueChartId[] = [
  "best-rated",
  "most-reviewed",
];

export type ChartPeriodPreset =
  | "any"
  | "30d"
  | "3m"
  | "12m"
  | "this-year"
  | "year"
  | "month";

/** Which games a chart covers, by release date. */
export interface ChartPeriod {
  preset: ChartPeriodPreset;
  /** For `year` and `month`. */
  year?: number;
  /** 1–12, for `month`. */
  month?: number;
}

export const ANY_PERIOD: ChartPeriod = { preset: "any" };

const DAY_MS = 24 * 60 * 60 * 1000;

/** The release dates a period covers, as unix ms (`to` exclusive); null for any time. */
export const getPeriodRange = (
  period: ChartPeriod | null | undefined,
  now = Date.now()
): { from: number; to: number } | null => {
  if (!period) return null;
  const today = new Date(now);
  const thisYear = today.getUTCFullYear();

  switch (period.preset) {
    case "30d":
      return { from: now - 30 * DAY_MS, to: now + DAY_MS };
    case "3m":
      return { from: now - 91 * DAY_MS, to: now + DAY_MS };
    case "12m":
      return { from: now - 365 * DAY_MS, to: now + DAY_MS };
    case "this-year":
      return {
        from: Date.UTC(thisYear, 0, 1),
        to: Date.UTC(thisYear + 1, 0, 1),
      };
    case "year": {
      const year = period.year ?? thisYear;
      return { from: Date.UTC(year, 0, 1), to: Date.UTC(year + 1, 0, 1) };
    }
    case "month": {
      const year = period.year ?? thisYear;
      const month = Math.min(12, Math.max(1, period.month ?? 1)) - 1;
      return {
        from: Date.UTC(year, month, 1),
        to: Date.UTC(year, month + 1, 1),
      };
    }
    default:
      return null;
  }
};

/** The release years a period touches, for searches that filter by year only. */
export const getPeriodYears = (
  period: ChartPeriod | null | undefined,
  now = Date.now()
): { gte: number; lte: number } | null => {
  const range = getPeriodRange(period, now);
  if (!range) return null;
  return {
    gte: new Date(range.from).getUTCFullYear(),
    lte: new Date(Math.min(range.to - 1, now)).getUTCFullYear(),
  };
};

export const isInPeriod = (
  releaseDate: number | null,
  period: ChartPeriod | null | undefined,
  now = Date.now()
) => {
  const range = getPeriodRange(period, now);
  if (!range) return true;
  return (
    releaseDate !== null && releaseDate >= range.from && releaseDate < range.to
  );
};

export interface CatalogueChartRequest {
  chart: CatalogueChartId;
  /** Best rated and Most reviewed fetch games released in it. */
  period?: ChartPeriod;
  /** Best rated and Most reviewed ask the stores for these tags only. */
  tags?: number[];
  /** Best rated and Most reviewed ask Steam to leave these tags out. */
  untags?: number[];
  /** Best rated: fewer reviews than this and a game is not ranked. */
  minReviews?: number;
}

/** Best rated's default floor: a perfect score from a handful of players is not a chart. */
export const BEST_RATED_MIN_REVIEWS = 500;

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
  /** Metacritic, part of the Hydra rating. */
  criticScore: number | null;
  releaseYear: number | null;
  /** Unix ms; for upcoming games, the announced date as precise as `releasePrecision`. */
  releaseDate: number | null;
  releasePrecision: "day" | "month" | "quarter" | "year" | "unknown";
  /** Left Early Access in the chart's period rather than first coming out in it. */
  leftEarlyAccessAt: number | null;
  isSingleplayer: boolean;
  isEarlyAccess: boolean;
  isFree: boolean;
  /** Players now, or the average over the window (30 and 90 days). */
  players: number | null;
  /** The day's highest number of players. */
  peak: number | null;
  /** Places gained since last week; negative for places lost. */
  places: number | null;
  isNew: boolean;
  /** Days in Steam's daily top 100 in the last 30 days (Hydra's own record). */
  days: number | null;
  /** Player-hours in the last 30 days (steamcharts.com). */
  hours: number | null;
}

export type CatalogueChartSource = "steam" | "steamcharts" | "hydra";

export interface CatalogueChartResult {
  rows: CatalogueChartRow[];
  /** A source that could not be reached; the chart is empty or partial. */
  failed: CatalogueChartSource | null;
  /** The 30 and 90 day charts before they have enough recorded days. */
  collecting: { since: string | null; days: number; needed: number } | null;
  /** Days of Steam's daily chart Hydra has recorded in the last 30, for the Days in top 100 column. */
  recordedDays: number;
  /** Unix milliseconds. */
  updatedAt: number;
}

/** Recorded days a window needs before its chart is more than a start. */
export const CHART_WINDOWS = {
  "days-30": { days: 30, needed: 7 },
  "days-90": { days: 90, needed: 30 },
} as const;

/** The chart's own ranking measure, as the column's header. */
export const CHART_PLAYERS_MEASURE: Partial<Record<CatalogueChartId, "now">> = {
  "playing-now": "now",
};

export type ChartProtonTier = "any" | "silver" | "gold" | "platinum";
export type ChartFreeToPlay = "any" | "only" | "hide";

export interface CatalogueChartFilters {
  /** Which games, by release date. Most anticipated ignores it. */
  period: ChartPeriod;
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
  period: ANY_PERIOD,
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
    /** Upcoming games have no release yet, so the period does not apply. */
    ignorePeriod?: boolean;
    now?: number;
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
    if (
      !context.ignorePeriod &&
      !isInPeriod(row.releaseDate, filters.period, context.now)
    )
      return false;
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
