import axios from "axios";
import type { GameShop, HowLongToBeatCategory } from "@types";
import {
  howLongToBeatCategoriesFromEntry,
  parseHowLongToBeat,
  pickHowLongToBeatEntry,
  type HowLongToBeatSearchEntry,
} from "@shared";
import { HydraApi } from "./hydra-api";
import { logger } from "./logger";

const SITE = "https://howlongtobeat.com";
// The site ties its search token to the User-Agent, so both calls send this one.
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const REQUEST_TIMEOUT_MS = 10_000;
const TOKEN_MAX_AGE_MS = 2 * 60 * 1000;
const FOUND_CACHE_MS = 6 * 60 * 60 * 1000;
const MISSING_CACHE_MS = 60 * 60 * 1000;
const ERROR_CACHE_MS = 5 * 60 * 1000;

const siteHeaders = { "User-Agent": USER_AGENT, Referer: `${SITE}/` };

let token: { value: string; at: number } | null = null;
const cache = new Map<
  string,
  { until: number; value: HowLongToBeatCategory[] | null }
>();
const inFlight = new Map<string, Promise<HowLongToBeatCategory[] | null>>();

const fetchToken = async (): Promise<string> => {
  if (token && Date.now() - token.at < TOKEN_MAX_AGE_MS) return token.value;

  const { data } = await axios.get<{ token?: string }>(
    `${SITE}/api/search/site/init`,
    {
      params: { t: Date.now() },
      headers: siteHeaders,
      timeout: REQUEST_TIMEOUT_MS,
    }
  );
  if (!data?.token) throw new Error("HowLongToBeat gave no search token");

  token = { value: data.token, at: Date.now() };
  return token.value;
};

const searchSite = async (
  title: string,
  retried = false
): Promise<HowLongToBeatSearchEntry[]> => {
  const authToken = await fetchToken();

  try {
    const { data } = await axios.post<{ data?: HowLongToBeatSearchEntry[] }>(
      `${SITE}/api/search/site`,
      {
        searchType: "games",
        searchTerms: title.trim().split(/\s+/),
        searchPage: 1,
        size: 20,
        searchOptions: {
          games: {
            userId: 0,
            platform: "",
            sortCategory: "popular",
            rangeCategory: "main",
            rangeTime: { min: null, max: null },
            gameplay: { perspective: "", flow: "", genre: "", difficulty: "" },
            rangeYear: { min: "", max: "" },
            modifier: "",
          },
          users: { sortCategory: "postcount" },
          lists: { sortCategory: "follows" },
          filter: "",
          sort: 0,
          randomizer: 0,
        },
        useCache: true,
      },
      {
        headers: {
          ...siteHeaders,
          Origin: SITE,
          "x-auth-token": authToken,
        },
        timeout: REQUEST_TIMEOUT_MS,
      }
    );
    return Array.isArray(data?.data) ? data.data : [];
  } catch (error) {
    // An expired token is a 403; fetch a new one once.
    if (
      !retried &&
      axios.isAxiosError(error) &&
      error.response?.status === 403
    ) {
      token = null;
      return searchSite(title, true);
    }
    throw error;
  }
};

/**
 * Hours from howlongtobeat.com's own search, for games the Hydra API has no
 * times for. Only a same-title entry counts. Null when there is none or the
 * site can't be reached.
 */
export const searchHowLongToBeat = async (
  title: string
): Promise<HowLongToBeatCategory[] | null> => {
  const key = title.trim().toLowerCase();
  if (!key) return null;

  const cached = cache.get(key);
  if (cached && cached.until > Date.now()) return cached.value;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const request = (async () => {
    try {
      const entry = pickHowLongToBeatEntry(await searchSite(title), title);
      const value = entry ? howLongToBeatCategoriesFromEntry(entry) : null;
      cache.set(key, {
        until: Date.now() + (value ? FOUND_CACHE_MS : MISSING_CACHE_MS),
        value,
      });
      return value;
    } catch (error) {
      logger.warn(`[HowLongToBeat] Search failed for "${title}"`, error);
      cache.set(key, { until: Date.now() + ERROR_CACHE_MS, value: null });
      return null;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, request);
  return request;
};

/**
 * The Hydra API's How Long to Beat categories, or, when it has no times for
 * the game, howlongtobeat.com's. Undefined when the API can't be reached and
 * the site has nothing either, so callers can tell "no data" from "offline".
 */
export const getHowLongToBeat = async (
  shop: GameShop,
  objectId: string,
  title: string
): Promise<HowLongToBeatCategory[] | null | undefined> => {
  let fromApi: HowLongToBeatCategory[] | null | undefined;
  try {
    fromApi = await HydraApi.get<HowLongToBeatCategory[] | null>(
      `/games/${shop}/${encodeURIComponent(objectId)}/how-long-to-beat`,
      null,
      { needsAuth: false }
    );
  } catch {
    fromApi = undefined;
  }

  if (parseHowLongToBeat(fromApi)) return fromApi;

  return (await searchHowLongToBeat(title)) ?? fromApi;
};
