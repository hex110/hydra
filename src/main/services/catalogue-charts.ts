import {
  CATALOGUE_CHART_IDS,
  CHART_WINDOWS,
  CHART_SIZE,
  getMovement,
  getTrending,
  isSingleplayerGame,
  STEAM_GAME_TYPE,
  type CatalogueChartRequest,
  type CatalogueChartResult,
  type CatalogueChartRow,
  type CatalogueChartSource,
  type ChartRank,
  type StoreItem,
} from "@shared";
import { HydraApi } from "./hydra-api";
import { getSnapshotRanking } from "./chart-snapshots";
import { logger } from "./logger";
import { getMostPlayed, getPlayingNow, getTopReleases } from "./steam-charts";
import { getStoreItems } from "./steam-store-items";
import { getSpyTag } from "./steamspy";

/** Enough for the table and for the tag filters; Steam lists twenty. */
const ROW_TAGS = 20;
const SPY_CANDIDATES = 500;
const BEST_RATED_PAGE = 50;

interface Entry {
  appId: string;
  players?: number | null;
  peak?: number | null;
  places?: number | null;
  isNew?: boolean;
  days?: number | null;
}

const toRow = (
  rank: number,
  entry: Entry,
  item: StoreItem
): CatalogueChartRow => ({
  rank,
  appId: entry.appId,
  title: item.title,
  headerImageUrl: item.headerImageUrl,
  tagIds: item.tags.slice(0, ROW_TAGS).map((tag) => tag.tagid),
  reviewPercent: item.reviewPercent,
  reviewCount: item.reviewCount,
  releaseYear: item.releaseDate
    ? new Date(item.releaseDate).getUTCFullYear()
    : null,
  isSingleplayer: isSingleplayerGame(item),
  isEarlyAccess: item.isEarlyAccess,
  isFree: item.isFree,
  players: entry.players ?? null,
  peak: entry.peak ?? null,
  places: entry.places ?? null,
  isNew: entry.isNew ?? false,
  days: entry.days ?? null,
});

/** Joins a ranked list with Steam's store facts; software and other non-games drop out. */
const toRows = async (entries: Entry[]) => {
  const items = await getStoreItems(entries.map((entry) => entry.appId));
  const rows: CatalogueChartRow[] = [];

  for (const entry of entries) {
    const item = items.get(entry.appId);
    if (item && item.type === STEAM_GAME_TYPE) {
      rows.push(toRow(rows.length + 1, entry, item));
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

const searchBestRated = async (): Promise<Entry[] | null> => {
  const pages = await Promise.all(
    [0, BEST_RATED_PAGE].map((skip) =>
      HydraApi.post<{ edges?: { shop: string; objectId: string }[] }>(
        "/catalogue/search",
        {
          title: "",
          sortBy: "hydraScore",
          sortOrder: "desc",
          downloadSourceFingerprints: [],
          downloadSourceIds: [],
          tags: [],
          publishers: [],
          genres: [],
          developers: [],
          protondbSupportBadges: [],
          deckCompatibility: [],
          take: BEST_RATED_PAGE,
          skip,
        },
        { needsAuth: false }
      ).catch((error) => {
        logger.warn("[CatalogueCharts] Best rated search failed", error);
        return null;
      })
    )
  );

  if (pages.some((page) => page === null)) return null;

  return pages
    .flatMap((page) => page?.edges ?? [])
    .filter((game) => game.shop === "steam")
    .map((game) => ({ appId: game.objectId }));
};

const result = (
  rows: CatalogueChartRow[],
  extra: Partial<CatalogueChartResult> = {}
): CatalogueChartResult => ({
  rows,
  failed: null,
  collecting: null,
  months: [],
  updatedAt: Date.now(),
  ...extra,
});

const failure = (source: CatalogueChartSource) =>
  result([], { failed: source });

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

    case "most-played": {
      const chart = await getMostPlayed();
      if (!chart) return failure("steam");
      return result(await toRows(fromRanks(chart.ranks)), {
        updatedAt: chart.rollupDate * 1000,
      });
    }

    case "trending": {
      const chart = await getMostPlayed();
      if (!chart) return failure("steam");
      return result(await toRows(fromRanks(getTrending(chart.ranks))), {
        updatedAt: chart.rollupDate * 1000,
      });
    }

    case "singleplayer": {
      const [playingNow, mostPlayed, spy] = await Promise.all([
        getPlayingNow(),
        getMostPlayed(),
        getSpyTag("Singleplayer"),
      ]);
      if (!spy && !playingNow && !mostPlayed) return failure("steamspy");

      // Players now where the live chart has the game, else SteamSpy's number
      // from yesterday's peak.
      const players = new Map<string, number>();
      const peaks = new Map<string, number | null>();
      for (const game of (spy ?? []).slice(0, SPY_CANDIDATES)) {
        players.set(game.appId, game.ccu);
      }
      for (const rank of playingNow?.ranks ?? []) {
        players.set(rank.appId, rank.concurrent ?? rank.peak ?? 0);
        peaks.set(rank.appId, rank.peak);
      }
      for (const rank of mostPlayed?.ranks ?? []) {
        if (!players.has(rank.appId)) players.set(rank.appId, rank.peak ?? 0);
      }

      const items = await getStoreItems([...players.keys()]);
      const entries = [...players]
        .filter(([appId]) => {
          const item = items.get(appId);
          return !!item && isSingleplayerGame(item);
        })
        .sort(([, a], [, b]) => b - a)
        .slice(0, CHART_SIZE)
        .map(([appId, count]) => ({
          appId,
          players: count,
          peak: peaks.get(appId) ?? null,
        }));

      return result(await toRows(entries), {
        failed: spy ? null : "steamspy",
      });
    }

    case "days-30":
    case "days-90": {
      const window = CHART_WINDOWS[request.chart];
      const ranking = await getSnapshotRanking(window.days);
      const rows = await toRows(
        ranking.rows.slice(0, CHART_SIZE).map((row) => ({
          appId: row.appId,
          days: row.days,
        }))
      );

      return result(rows, {
        collecting:
          ranking.days < window.needed
            ? {
                since: ranking.since,
                days: ranking.days,
                needed: window.days,
              }
            : null,
      });
    }

    case "top-releases": {
      const months = await getTopReleases();
      if (!months) return failure("steam");

      const month =
        months.find((entry) => entry.startOfMonth === request.month) ??
        months[0];
      return result(await toRows(month.appIds.map((appId) => ({ appId }))), {
        months: months.map(({ startOfMonth, name }) => ({
          startOfMonth,
          name,
        })),
        updatedAt: month.startOfMonth * 1000,
      });
    }

    case "best-rated": {
      const entries = await searchBestRated();
      if (!entries) return failure("hydra");
      return result(await toRows(entries));
    }
  }
};
