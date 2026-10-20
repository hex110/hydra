import axios from "axios";
import { parseSteamNews, type GameNewsItem } from "@shared";
import { logger } from "./logger";

const NEWS_URL = "https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/";
const CACHE_MS = 30 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_APPS = 12;
const MAX_ITEMS_PER_APP = 5;

const cache = new Map<string, { at: number; items: GameNewsItem[] }>();

const fetchAppNews = async (
  appId: string,
  count: number
): Promise<GameNewsItem[]> => {
  const cached = cache.get(appId);
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return cached.items.slice(0, count);
  }

  try {
    // Official announcements only; other feeds repost press articles.
    const response = await axios.get(NEWS_URL, {
      params: {
        appid: appId,
        count: MAX_ITEMS_PER_APP,
        maxlength: 0,
        feeds: "steam_community_announcements",
        format: "json",
      },
      timeout: REQUEST_TIMEOUT_MS,
    });
    const items = parseSteamNews(response.data, appId);
    cache.set(appId, { at: Date.now(), items });
    return items.slice(0, count);
  } catch (error) {
    logger.warn(`Failed to fetch Steam news for ${appId}`, error);
    return cached?.items.slice(0, count) ?? [];
  }
};

/** Steam's public news for the given apps, newest first. No key needed. */
export const getSteamNews = async (
  appIds: string[],
  countPerApp = 3
): Promise<GameNewsItem[]> => {
  const ids = [...new Set(appIds.filter((id) => /^\d+$/.test(id)))].slice(
    0,
    MAX_APPS
  );
  const count = Math.min(Math.max(1, countPerApp), MAX_ITEMS_PER_APP);
  const results = await Promise.all(ids.map((id) => fetchAppNews(id, count)));

  return results
    .flat()
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};
