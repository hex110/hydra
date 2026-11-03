import axios from "axios";
import {
  getNinetyDayFigures,
  parseSteamChartsApp,
  parseSteamChartsTop,
  type SteamChartsApp,
  type SteamChartsTopRow,
} from "@shared";
import { steamChartsCacheSublevel } from "@main/level";
import { logger } from "./logger";

const BASE_URL = "https://steamcharts.com";
const REQUEST_GAP_MS = 1000;
const TIMEOUT_MS = 20_000;
const TOP_CACHE_MS = 6 * 60 * 60 * 1000;
const APP_CACHE_MS = 24 * 60 * 60 * 1000;
const TOP_PAGES = 8;
const NINETY_DAY_CANDIDATES = 50;

let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

/** The site has no API and asks for nothing, so be polite: one request a second. */
const inQueue = <T>(task: () => Promise<T>): Promise<T> => {
  const run = queue.then(async () => {
    const wait = lastRequestAt + REQUEST_GAP_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    try {
      return await task();
    } finally {
      lastRequestAt = Date.now();
    }
  });
  queue = run.catch(() => undefined);
  return run;
};

/** A parsed page, from the database while fresh, else fetched. Null when it could not be read. */
const loadPage = async <T extends SteamChartsTopRow[] | SteamChartsApp>(
  cacheKey: string,
  path: string,
  ttlMs: number,
  parse: (html: string) => T | null
): Promise<T | null> => {
  const stored = await steamChartsCacheSublevel
    .get(cacheKey)
    .catch(() => undefined);
  if (stored && Date.now() - stored.at < ttlMs) return stored.data as T;

  try {
    const response = await inQueue(() =>
      axios.get<string>(`${BASE_URL}${path}`, {
        timeout: TIMEOUT_MS,
        responseType: "text",
      })
    );
    const data = parse(response.data);
    if (!data || (Array.isArray(data) && data.length === 0)) {
      throw new Error("Could not read the page");
    }

    await steamChartsCacheSublevel
      .put(cacheKey, { at: Date.now(), data })
      .catch((error) =>
        logger.warn("[SteamCharts.com] Could not keep the page", error)
      );
    return data;
  } catch (error) {
    logger.warn(`[SteamCharts.com] ${path} failed`, error);
    return (stored?.data as T | undefined) ?? null;
  }
};

/**
 * The top 200 games by players now, each with the last 30 days' peak and
 * player-hours. Null when the site could not be reached at all; a later page
 * that fails only shortens the list.
 */
export const getSteamChartsTop = async (): Promise<
  SteamChartsTopRow[] | null
> => {
  const rows: SteamChartsTopRow[] = [];

  for (let page = 1; page <= TOP_PAGES; page++) {
    const parsed = await loadPage(
      `top:${page}`,
      page === 1 ? "/top" : `/top/p.${page}`,
      TOP_CACHE_MS,
      (html) => parseSteamChartsTop(html)
    );
    if (!parsed) {
      if (page === 1) return null;
      break;
    }
    rows.push(...parsed);
  }

  return rows;
};

/**
 * Average and peak players over roughly the last 90 days for the games with
 * the most player-hours in the last 30. Each needs a page of its own, fetched
 * a second apart and kept for a day, so a first call takes a minute.
 */
export const getSteamCharts90Days = async (
  top: SteamChartsTopRow[]
): Promise<
  { appId: string; averagePlayers: number; peak: number }[] | null
> => {
  const candidates = [...top]
    .sort((a, b) => b.hours - a.hours)
    .slice(0, NINETY_DAY_CANDIDATES);
  const figures: { appId: string; averagePlayers: number; peak: number }[] = [];
  let failed = 0;

  for (const game of candidates) {
    const app = await loadPage(
      `app:${game.appId}`,
      `/app/${game.appId}`,
      APP_CACHE_MS,
      parseSteamChartsApp
    );
    const result = app && getNinetyDayFigures(app, Date.now());
    if (result) figures.push({ appId: game.appId, ...result });
    else failed++;
  }

  return figures.length === 0 && failed > 0 ? null : figures;
};
