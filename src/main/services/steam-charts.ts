import axios from "axios";
import {
  parseMostPlayed,
  parsePlayingNow,
  toSnapshotDate,
  type MostPlayedChart,
  type PlayingNowChart,
} from "@shared";
import { recordChartSnapshot } from "./chart-snapshots";
import { logger } from "./logger";

const BASE_URL = "https://api.steampowered.com/ISteamChartsService/";
const REQUEST_TIMEOUT_MS = 15_000;

const cached = <T>(
  name: string,
  endpoint: string,
  ttlMs: number,
  parse: (body: unknown) => T | null,
  onFresh?: (value: T) => void
) => {
  let entry: { at: number; value: T } | null = null;

  /** Null when Steam could not be reached and nothing is kept. */
  return async (): Promise<T | null> => {
    if (entry && Date.now() - entry.at < ttlMs) return entry.value;

    try {
      const response = await axios.get(`${BASE_URL}${endpoint}/v1/`, {
        timeout: REQUEST_TIMEOUT_MS,
      });
      const value = parse(response.data);
      if (value === null) throw new Error("Unexpected answer");

      entry = { at: Date.now(), value };
      onFresh?.(value);
      return value;
    } catch (error) {
      logger.warn(`[SteamCharts] ${name} request failed`, error);
      return entry?.value ?? null;
    }
  };
};

/** Top 100 by the day's peak, with last week's rank; kept an hour. Each new day is recorded as a snapshot. */
export const getMostPlayed = cached<MostPlayedChart>(
  "Most played",
  "GetMostPlayedGames",
  60 * 60 * 1000,
  parseMostPlayed,
  (chart) =>
    void recordChartSnapshot(
      toSnapshotDate(chart.rollupDate),
      chart.ranks.map((rank) => rank.appId)
    )
);

/** Top 100 by players in game right now; kept 15 minutes. */
export const getPlayingNow = cached<PlayingNowChart>(
  "Playing now",
  "GetGamesByConcurrentPlayers",
  15 * 60 * 1000,
  parsePlayingNow
);
