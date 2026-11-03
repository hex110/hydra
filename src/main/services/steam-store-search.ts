import axios from "axios";
import {
  buildSteamSearchParams,
  parseSteamSearchResponse,
  type SteamSearchQuery,
} from "@shared";
import { logger } from "./logger";

const SEARCH_URL = "https://store.steampowered.com/search/results/";
const CACHE_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;
/** Steam's store pages are not an API; ask one page at a time, a moment apart. */
const GAP_MS = 400;

const cache = new Map<
  string,
  { at: number; result: { total: number; appIds: string[] } }
>();
let queue: Promise<unknown> = Promise.resolve();

const request = async (query: SteamSearchQuery) => {
  try {
    const response = await axios.get(SEARCH_URL, {
      params: buildSteamSearchParams(query),
      timeout: REQUEST_TIMEOUT_MS,
    });
    const result = parseSteamSearchResponse(response.data);
    if (!result) logger.warn("[SteamStoreSearch] Unexpected search answer");
    return result;
  } catch (error) {
    logger.warn("[SteamStoreSearch] Store search failed", error);
    return null;
  }
};

/**
 * One page of Steam's store search (games only): include and exclude tags,
 * Steam's sorts and named lists. Kept for an hour; null when Steam could not
 * be reached or answered something else.
 */
export const searchSteamStore = (
  query: SteamSearchQuery
): Promise<{ total: number; appIds: string[] } | null> => {
  const key = JSON.stringify(buildSteamSearchParams(query));
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return Promise.resolve(cached.result);
  }

  const next = queue.then(async () => {
    const result = await request(query);
    if (result) cache.set(key, { at: Date.now(), result });
    await new Promise((resolve) => setTimeout(resolve, GAP_MS));
    return result;
  });
  queue = next.catch(() => undefined);
  return next;
};

/** Several pages in a row; stops at the first failure and returns what it has, or null if the first page failed. */
export const searchSteamStorePages = async (
  query: SteamSearchQuery,
  pages: number
): Promise<string[] | null> => {
  const appIds: string[] = [];
  for (let page = 0; page < pages; page++) {
    const result = await searchSteamStore({
      ...query,
      start: (query.start ?? 0) + page * (query.count ?? 100),
    });
    if (!result) return page === 0 ? null : appIds;
    appIds.push(...result.appIds.filter((id) => !appIds.includes(id)));
    if (result.appIds.length < (query.count ?? 100)) break;
  }
  return appIds;
};
