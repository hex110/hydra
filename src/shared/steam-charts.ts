export interface ChartRank {
  rank: number;
  appId: string;
  /** Yesterday's rank on the daily chart; null when the game was not listed. */
  lastWeekRank: number | null;
  /** The day's highest number of players in game. */
  peak: number | null;
  /** Players in game when the list was made (the live chart only). */
  concurrent: number | null;
}

export interface MostPlayedChart {
  /** Unix seconds of the day the ranks cover. */
  rollupDate: number;
  ranks: ChartRank[];
}

export interface PlayingNowChart {
  /** Unix seconds. */
  updatedAt: number;
  ranks: ChartRank[];
}

const asNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const parseRanks = (list: unknown): ChartRank[] => {
  if (!Array.isArray(list)) return [];

  return list.flatMap((entry) => {
    const rank = asNumber(entry?.rank);
    const appId = asNumber(entry?.appid);
    if (rank === null || appId === null) return [];

    const lastWeek = asNumber(entry.last_week_rank);
    return [
      {
        rank,
        appId: String(appId),
        lastWeekRank: lastWeek !== null && lastWeek > 0 ? lastWeek : null,
        peak: asNumber(entry.peak_in_game),
        concurrent: asNumber(entry.concurrent_in_game),
      },
    ];
  });
};

/** `ISteamChartsService/GetMostPlayedGames`. */
export const parseMostPlayed = (body: unknown): MostPlayedChart | null => {
  const response = (body as { response?: Record<string, unknown> })?.response;
  const rollupDate = asNumber(response?.rollup_date);
  const ranks = parseRanks(response?.ranks);

  return rollupDate === null || ranks.length === 0
    ? null
    : { rollupDate, ranks };
};

/** `ISteamChartsService/GetGamesByConcurrentPlayers`. */
export const parsePlayingNow = (body: unknown): PlayingNowChart | null => {
  const response = (body as { response?: Record<string, unknown> })?.response;
  const updatedAt = asNumber(response?.last_update);
  const ranks = parseRanks(response?.ranks);

  return updatedAt === null || ranks.length === 0 ? null : { updatedAt, ranks };
};

/** Places gained since last week that make a game "trending". */
export const TRENDING_MIN_PLACES = 5;

export interface Movement {
  /** Places gained (positive) or lost since last week; null for a new entry. */
  places: number | null;
  isNew: boolean;
}

export const getMovement = (rank: ChartRank): Movement =>
  rank.lastWeekRank === null
    ? { places: null, isNew: true }
    : { places: rank.lastWeekRank - rank.rank, isNew: false };

/** Games that gained {@link TRENDING_MIN_PLACES} places since last week or are new, by places gained. */
export const getTrending = (ranks: ChartRank[]): ChartRank[] =>
  ranks
    .filter((rank) => {
      const movement = getMovement(rank);
      return movement.isNew || (movement.places ?? 0) >= TRENDING_MIN_PLACES;
    })
    .sort(
      (a, b) =>
        (getMovement(b).places ?? Infinity) -
          (getMovement(a).places ?? Infinity) || a.rank - b.rank
    );

export interface SnapshotRankingRow {
  appId: string;
  score: number;
  /** Days of the window the game was in the top 100. */
  days: number;
  bestRank: number;
}

export const CHART_SIZE = 100;

/**
 * Games ranked by the sum of `101 − rank` over the daily snapshots in the
 * window. `snapshots` maps `YYYY-MM-DD` to that day's ranks (app ids by rank).
 */
export const rankSnapshots = (
  snapshots: Record<string, string[]>,
  dates: string[]
): { rows: SnapshotRankingRow[]; days: number } => {
  const byApp = new Map<string, SnapshotRankingRow>();
  let days = 0;

  for (const date of dates) {
    const ranked = snapshots[date];
    if (!ranked) continue;
    days++;

    ranked.forEach((appId, index) => {
      const rank = index + 1;
      const row = byApp.get(appId) ?? {
        appId,
        score: 0,
        days: 0,
        bestRank: rank,
      };
      row.score += CHART_SIZE + 1 - rank;
      row.days++;
      row.bestRank = Math.min(row.bestRank, rank);
      byApp.set(appId, row);
    });
  }

  return {
    rows: [...byApp.values()].sort(
      (a, b) => b.score - a.score || a.bestRank - b.bestRank
    ),
    days,
  };
};

/** `YYYY-MM-DD` (UTC) of a unix-seconds timestamp. */
export const toSnapshotDate = (unixSeconds: number) =>
  new Date(unixSeconds * 1000).toISOString().slice(0, 10);

/** The `days` dates ending at `endDate`, newest first. */
export const windowDates = (endDate: string, days: number) => {
  const end = Date.parse(`${endDate}T00:00:00Z`);
  return Array.from({ length: days }, (_, index) =>
    new Date(end - index * 86_400_000).toISOString().slice(0, 10)
  );
};
