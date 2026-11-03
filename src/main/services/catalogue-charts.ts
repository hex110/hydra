import { createHash } from "node:crypto";
import {
  BEST_RATED_MIN_REVIEWS,
  CATALOGUE_CHART_IDS,
  CHART_WINDOWS,
  CHART_SIZE,
  getMovement,
  getPeriodYears,
  getStoreRating,
  getTrending,
  isInPeriod,
  isSingleplayerGame,
  STEAM_GAME_TYPE,
  type CatalogueChartRequest,
  type CatalogueChartResult,
  type CatalogueChartRow,
  type CatalogueChartSource,
  type ChartPeriod,
  type ChartRank,
  type StoreItem,
} from "@shared";
import { HydraApi } from "./hydra-api";
import { getCriticScores } from "./critic-scores";
import { getSnapshotRanking } from "./chart-snapshots";
import { logger } from "./logger";
import { getMostPlayed, getPlayingNow } from "./steam-charts";
import { getStoreItems } from "./steam-store-items";
import { searchSteamStorePages } from "./steam-store-search";
import { getSteamCharts90Days, getSteamChartsTop } from "./steamcharts";

/** Enough for the table and for the tag filters; Steam lists twenty. */
const ROW_TAGS = 20;
const HYDRA_PAGE = 100;
/** Most reviewed games of the period asked from Hydra: the pool Best rated ranks. */
const HYDRA_PAGES = 5;
const STEAM_PAGES = 3;
const ANTICIPATED_PAGES = 2;
const STORE_CACHE_MS = 60 * 60 * 1000;
/** Window for the Days in top 100 column. */
const DAYS_WINDOW = 30;

interface Entry {
  appId: string;
  players?: number | null;
  peak?: number | null;
  places?: number | null;
  isNew?: boolean;
  hours?: number | null;
}

const toRow = (
  rank: number,
  entry: Entry,
  item: StoreItem,
  criticScore: number | null,
  days: number | null
): CatalogueChartRow => ({
  rank,
  appId: entry.appId,
  title: item.title,
  headerImageUrl: item.headerImageUrl,
  tagIds: item.tags.slice(0, ROW_TAGS).map((tag) => tag.tagid),
  reviewPercent: item.reviewPercent,
  reviewCount: item.reviewCount,
  criticScore,
  releaseYear: item.releaseDate
    ? new Date(item.releaseDate).getUTCFullYear()
    : null,
  releaseDate: item.releaseDate,
  releasePrecision: item.releasePrecision ?? "day",
  leftEarlyAccessAt: item.leftEarlyAccessAt ?? null,
  isSingleplayer: isSingleplayerGame(item),
  isEarlyAccess: item.isEarlyAccess,
  isFree: item.isFree,
  players: entry.players ?? null,
  peak: entry.peak ?? null,
  places: entry.places ?? null,
  isNew: entry.isNew ?? false,
  days,
  hours: entry.hours ?? null,
});

/** Joins a ranked list with Steam's store facts; software and other non-games drop out. */
const toRows = async (
  entries: Entry[],
  days: Map<string, number> | null = null
) => {
  const appIds = entries.map((entry) => entry.appId);
  const [items, critics] = await Promise.all([
    getStoreItems(appIds),
    getCriticScores(appIds),
  ]);
  const rows: CatalogueChartRow[] = [];

  for (const entry of entries) {
    const item = items.get(entry.appId);
    if (item && item.type === STEAM_GAME_TYPE) {
      rows.push(
        toRow(
          rows.length + 1,
          entry,
          item,
          critics.get(entry.appId) ?? null,
          days ? (days.get(entry.appId) ?? 0) : null
        )
      );
    }
  }
  return rows;
};

const fromRanks = (ranks: ChartRank[]): Entry[] =>
  ranks.map((rank) => ({
    appId: rank.appId,
    players: rank.concurrent,
    peak: rank.peak,
    ...getMovement(rank),
  }));

/** How many of the last 30 days each game was in Steam's daily top 100, from Hydra's own record. */
const getDaysOnChart = async () => {
  const ranking = await getSnapshotRanking(DAYS_WINDOW);
  return {
    recorded: ranking.days,
    days: new Map(ranking.rows.map((row) => [row.appId, row.days])),
  };
};

const searchMostReviewed = async (
  period: ChartPeriod | undefined,
  tags: number[],
  page: number
) => {
  const years = getPeriodYears(period);
  const response = await HydraApi.post<{
    edges?: { shop: string; objectId: string }[];
  }>(
    "/catalogue/search",
    {
      title: "",
      sortBy: "reviewScore",
      sortOrder: "desc",
      downloadSourceFingerprints: [],
      downloadSourceIds: [],
      tags,
      publishers: [],
      genres: [],
      developers: [],
      protondbSupportBadges: [],
      deckCompatibility: [],
      ...(years ? { releaseYear: years } : {}),
      take: HYDRA_PAGE,
      skip: page * HYDRA_PAGE,
    },
    { needsAuth: false }
  );
  return (response?.edges ?? [])
    .filter((game) => game.shop === "steam")
    .map((game) => game.objectId);
};

const storeCache = new Map<
  string,
  Promise<{ appIds: string[]; failed: boolean }>
>();

/**
 * The games a store-ranked chart ranks: Hydra's most reviewed games of the
 * period (it filters by year), plus, for any time, Steam's own search by
 * user reviews with the chart's tags and excluded tags. Kept for an hour.
 */
export const getStoreRankedCandidates = (
  period: ChartPeriod | undefined,
  tags: number[] = [],
  untags: number[] = []
): Promise<{ appIds: string[]; failed: boolean }> => {
  const key = createHash("sha1")
    .update(JSON.stringify([period, tags, untags]))
    .digest("hex");
  const cached = storeCache.get(key);
  if (cached) return cached;

  const load = async () => {
    const pages = await Promise.all(
      Array.from({ length: HYDRA_PAGES }, (_, page) =>
        searchMostReviewed(period, tags, page).catch((error) => {
          logger.warn("[CatalogueCharts] Most reviewed search failed", error);
          return null;
        })
      )
    );
    const hydra = pages.flatMap((page) => page ?? []);

    // Steam's search has no release filter, so it only adds to "any time".
    const steam =
      !period || period.preset === "any"
        ? await searchSteamStorePages(
            { tags, untags, sortBy: "Reviews_DESC" },
            STEAM_PAGES
          )
        : [];

    return {
      appIds: [...new Set([...hydra, ...(steam ?? [])])],
      failed: pages[0] === null && (steam === null || steam.length === 0),
    };
  };

  const promise = load();
  storeCache.set(key, promise);
  setTimeout(() => storeCache.delete(key), STORE_CACHE_MS).unref?.();
  void promise.then((result) => {
    if (result.failed) storeCache.delete(key);
  });
  return promise;
};

const result = (
  rows: CatalogueChartRow[],
  extra: Partial<CatalogueChartResult> = {}
): CatalogueChartResult => ({
  rows,
  failed: null,
  collecting: null,
  recordedDays: 0,
  updatedAt: Date.now(),
  ...extra,
});

const failure = (source: CatalogueChartSource) =>
  result([], { failed: source });

const ninetyDayEntries = async (
  top: Parameters<typeof getSteamCharts90Days>[0]
): Promise<Entry[]> => {
  const figures = (await getSteamCharts90Days(top)) ?? [];
  return figures
    .sort((a, b) => b.averagePlayers - a.averagePlayers)
    .slice(0, CHART_SIZE)
    .map((game) => ({
      appId: game.appId,
      players: Math.round(game.averagePlayers),
      peak: game.peak,
    }));
};

const storeRanked = async (
  request: CatalogueChartRequest
): Promise<CatalogueChartResult> => {
  const { appIds, failed } = await getStoreRankedCandidates(
    request.period,
    request.tags ?? [],
    request.untags ?? []
  );
  if (appIds.length === 0) return failure(failed ? "hydra" : "steam");

  // Hydra searches by year; the period may be a month or the last 30 days.
  const rows = (await toRows(appIds.map((appId) => ({ appId })))).filter(
    (row) => isInPeriod(row.releaseDate, request.period)
  );

  const minReviews =
    request.chart === "best-rated"
      ? (request.minReviews ?? BEST_RATED_MIN_REVIEWS)
      : 0;
  const measure = (row: CatalogueChartRow) =>
    request.chart === "best-rated"
      ? (getStoreRating(row)?.value ?? 0)
      : (row.reviewCount ?? 0);

  const ranked = rows
    .filter((row) => (row.reviewCount ?? 0) >= minReviews)
    .sort((a, b) => measure(b) - measure(a))
    .slice(0, CHART_SIZE)
    .map((row, index) => ({ ...row, rank: index + 1 }));

  return result(ranked, { failed: failed ? "hydra" : null });
};

/** One chart's rows, with Steam's store facts. Failures name the source that could not be reached. */
export const getCatalogueChart = async (
  request: CatalogueChartRequest
): Promise<CatalogueChartResult> => {
  if (!CATALOGUE_CHART_IDS.includes(request?.chart)) return failure("steam");

  switch (request.chart) {
    case "playing-now": {
      const chart = await getPlayingNow();
      if (!chart) return failure("steam");
      return result(await toRows(fromRanks(chart.ranks)), {
        updatedAt: chart.updatedAt * 1000,
      });
    }

    case "most-played":
    case "trending": {
      const [chart, onChart] = await Promise.all([
        getMostPlayed(),
        getDaysOnChart(),
      ]);
      if (!chart) return failure("steam");
      const ranks =
        request.chart === "trending" ? getTrending(chart.ranks) : chart.ranks;
      return result(await toRows(fromRanks(ranks), onChart.days), {
        updatedAt: chart.rollupDate * 1000,
        recordedDays: onChart.recorded,
      });
    }

    case "days-30":
    case "days-90": {
      const window = CHART_WINDOWS[request.chart];
      const top = await getSteamChartsTop();

      if (top) {
        const entries: Entry[] =
          request.chart === "days-30"
            ? [...top]
                .sort((a, b) => b.hours - a.hours)
                .slice(0, CHART_SIZE)
                .map((game) => ({
                  appId: game.appId,
                  hours: game.hours,
                  peak: game.peak,
                }))
            : await ninetyDayEntries(top);

        if (entries.length > 0) return result(await toRows(entries));
      }

      // steamcharts.com is down: fall back to what Hydra recorded itself.
      const ranking = await getSnapshotRanking(window.days);
      const days = new Map(ranking.rows.map((row) => [row.appId, row.days]));
      const rows = await toRows(
        ranking.rows.slice(0, CHART_SIZE).map((row) => ({ appId: row.appId })),
        days
      );

      return result(rows, {
        failed: "steamcharts",
        recordedDays: ranking.days,
        collecting:
          ranking.days < window.needed
            ? { since: ranking.since, days: ranking.days, needed: window.days }
            : null,
      });
    }

    case "best-rated":
    case "most-reviewed":
      return storeRanked(request);

    case "most-anticipated": {
      const appIds = await searchSteamStorePages(
        { filter: "popularcomingsoon", count: 50 },
        ANTICIPATED_PAGES
      );
      if (!appIds) return failure("steam");
      const rows = (await toRows(appIds.map((appId) => ({ appId }))))
        .slice(0, CHART_SIZE)
        .map((row, index) => ({ ...row, rank: index + 1 }));
      return result(rows);
    }
  }
};
