import axios from "axios";
import {
  parseSteamCurrentPlayers,
  parseSteamMetacritic,
  parseSteamReviews,
  type GameReception,
} from "@shared";
import { logger } from "./logger";

const REVIEWS_URL =
  "https://api.steampowered.com/IStoreBrowseService/GetItems/v1/";
const PLAYERS_URL =
  "https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/";
const DETAILS_URL = "https://store.steampowered.com/api/appdetails";
const CACHE_MS = 15 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;

const cache = new Map<string, { at: number; value: GameReception }>();

const request = async (url: string, params: Record<string, unknown>) => {
  try {
    const response = await axios.get(url, {
      params,
      timeout: REQUEST_TIMEOUT_MS,
    });
    return response.data as unknown;
  } catch (error) {
    logger.warn(`Steam request failed: ${url}`, error);
    return null;
  }
};

/** Steam's reviews, current players and Metacritic score. No key needed. */
export const getSteamReception = async (
  appId: string
): Promise<GameReception | null> => {
  if (!/^\d+$/.test(appId)) return null;

  const cached = cache.get(appId);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;

  const [reviews, players, details] = await Promise.all([
    request(REVIEWS_URL, {
      input_json: JSON.stringify({
        ids: [{ appid: Number(appId) }],
        context: { language: "english", country_code: "US" },
        data_request: { include_reviews: true },
      }),
    }),
    request(PLAYERS_URL, { appid: appId }),
    request(DETAILS_URL, { appids: appId, filters: "metacritic" }),
  ]);

  const value: GameReception = {
    reviews: parseSteamReviews(reviews),
    currentPlayers: parseSteamCurrentPlayers(players),
    metacritic: parseSteamMetacritic(details, appId),
  };

  // All three failing is more likely a network error than a game with no data.
  if (reviews === null && players === null && details === null) {
    return cached?.value ?? null;
  }

  cache.set(appId, { at: Date.now(), value });
  return value;
};
