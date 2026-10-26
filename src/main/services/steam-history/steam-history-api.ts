import axios, { type InternalAxiosRequestConfig } from "axios";

import type { SteamStoreItem } from "./steam-wishlist-core";
import type {
  SteamOwnedGame,
  SteamPlayerAchievement,
  SteamSchemaAchievement,
} from "./steam-history-core";

export interface SteamHistoryCredentials {
  apiKey: string;
  steamId: string;
}

const steam = axios.create({
  baseURL: "https://api.steampowered.com",
  timeout: 20_000,
});

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 2_000;

// The first import reads hundreds of games; back off when Steam rate-limits or hiccups.
steam.interceptors.response.use(undefined, async (error: unknown) => {
  if (!axios.isAxiosError(error) || !error.config) throw error;

  const status = error.response?.status ?? 0;
  const config = error.config as InternalAxiosRequestConfig & {
    retryCount?: number;
  };
  const attempt = config.retryCount ?? 0;
  if (![429, 502, 503].includes(status) || attempt >= MAX_RETRIES) throw error;

  const retryAfter = Number(error.response?.headers["retry-after"]);
  const delay =
    Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : RETRY_BASE_MS * 2 ** attempt;

  config.retryCount = attempt + 1;
  await new Promise((resolve) => setTimeout(resolve, delay));
  return steam.request(config);
});

export const fetchOwnedGames = async ({
  apiKey,
  steamId,
}: SteamHistoryCredentials) => {
  const { data } = await steam.get<{ response?: { games?: SteamOwnedGame[] } }>(
    "/IPlayerService/GetOwnedGames/v1/",
    {
      params: {
        key: apiKey,
        steamid: steamId,
        include_appinfo: 1,
        include_played_free_games: 1,
        format: "json",
      },
    }
  );

  // Steam answers an empty object for a private profile.
  const games = data.response?.games;
  if (!games) throw new Error("steam-history-private-or-empty");
  return games;
};

/** Null when the game has no stats or the player's stats are private. */
export const fetchPlayerAchievements = async (
  { apiKey, steamId }: SteamHistoryCredentials,
  appId: string
): Promise<SteamPlayerAchievement[] | null> => {
  try {
    const { data } = await steam.get<{
      playerstats?: { achievements?: SteamPlayerAchievement[] };
    }>("/ISteamUserStats/GetPlayerAchievements/v1/", {
      params: { key: apiKey, steamid: steamId, appid: appId, format: "json" },
    });
    return data.playerstats?.achievements ?? null;
  } catch (error) {
    // Games without achievements answer 400 or 403 here.
    if (
      axios.isAxiosError(error) &&
      [400, 403].includes(error.response?.status ?? 0)
    ) {
      return null;
    }
    throw error;
  }
};

export const fetchAchievementSchema = async (
  { apiKey }: SteamHistoryCredentials,
  appId: string
): Promise<SteamSchemaAchievement[]> => {
  const { data } = await steam.get<{
    game?: { availableGameStats?: { achievements?: SteamSchemaAchievement[] } };
  }>("/ISteamUserStats/GetSchemaForGame/v2/", {
    params: { key: apiKey, appid: appId, l: "english", format: "json" },
  });
  return data.game?.availableGameStats?.achievements ?? [];
};

export interface SteamWishlistItem {
  appid: number;
  priority?: number;
  date_added?: number;
}

/** The profile's game details must be public for the wishlist to be readable. */
export const fetchWishlist = async ({
  apiKey,
  steamId,
}: SteamHistoryCredentials) => {
  const { data } = await steam.get<{
    response?: { items?: SteamWishlistItem[] };
  }>("/IWishlistService/GetWishlist/v1/", {
    params: { key: apiKey, steamid: steamId, format: "json" },
  });

  return data.response?.items ?? [];
};

const STORE_BATCH_SIZE = 200;

/** Release data for many apps at once; Steam answers a batch in about a second. */
export const fetchStoreItems = async (appIds: number[]) => {
  const items: SteamStoreItem[] = [];

  for (let start = 0; start < appIds.length; start += STORE_BATCH_SIZE) {
    const ids = appIds
      .slice(start, start + STORE_BATCH_SIZE)
      .map((appid) => ({ appid }));
    const { data } = await steam.get<{
      response?: { store_items?: SteamStoreItem[] };
    }>("/IStoreBrowseService/GetItems/v1/", {
      params: {
        input_json: JSON.stringify({
          ids,
          context: { language: "english", country_code: "US" },
          data_request: { include_release: true },
        }),
      },
    });

    items.push(...(data.response?.store_items ?? []));
  }

  return items;
};
