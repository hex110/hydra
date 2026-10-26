import axios from "axios";

import {
  db,
  gamesShopAssetsSublevel,
  gamesSublevel,
  levelKeys,
} from "@main/level";
import { isSameTitle } from "@shared";
import type {
  ArtworkItem,
  ArtworkKind,
  GameShop,
  UserPreferences,
} from "@types";

const steamGridDb = axios.create({
  baseURL: "https://www.steamgriddb.com/api/v2",
  timeout: 15_000,
});

interface SteamGridDbResponse<T> {
  success: boolean;
  data?: T;
}

interface SteamGridDbGame {
  id: number;
  name: string;
}

export const getSteamGridDbApiKey = async () => {
  const preferences = await db
    .get<string, UserPreferences | null>(levelKeys.userPreferences, {
      valueEncoding: "json",
    })
    .catch(() => null);

  return preferences?.steamGridDbApiKey?.trim() || null;
};

const authorized = (apiKey: string) => ({
  headers: { Authorization: `Bearer ${apiKey}` },
});

/** Throws when SteamGridDB rejects the key. */
export const testSteamGridDbApiKey = async (apiKey: string) => {
  await steamGridDb.get("/search/autocomplete/portal", authorized(apiKey));
};

// Non-Steam games are found by title once per session.
const gameIdByKey = new Map<string, number | null>();

const findGameId = async (apiKey: string, shop: GameShop, objectId: string) => {
  const key = levelKeys.game(shop, objectId);
  if (gameIdByKey.has(key)) return gameIdByKey.get(key) ?? null;

  const title =
    (await gamesShopAssetsSublevel.get(key).catch(() => null))?.title ??
    (await gamesSublevel.get(key).catch(() => null))?.title;
  if (!title) return null;

  const { data } = await steamGridDb.get<
    SteamGridDbResponse<SteamGridDbGame[]>
  >(`/search/autocomplete/${encodeURIComponent(title)}`, authorized(apiKey));
  const results = data.data ?? [];
  const exact = results.filter((game) => isSameTitle(game.name, title));
  // Only an unambiguous title match, never a guess.
  const id = exact.length === 1 ? exact[0].id : null;

  gameIdByKey.set(key, id);
  return id;
};

const resourcePath = async (
  apiKey: string,
  shop: GameShop,
  objectId: string
) => {
  if (shop === "steam") return `steam/${objectId}`;

  const id = await findGameId(apiKey, shop, objectId);
  return id === null ? null : `game/${id}`;
};

/**
 * Asks SteamGridDB directly with the user's own key, so artwork works without
 * a Hydra account. Same query and item shape as Hydra's proxy.
 */
export const fetchSteamGridDbArtwork = async (
  apiKey: string,
  shop: GameShop,
  objectId: string,
  kind: ArtworkKind,
  query: Record<string, string | number>,
  timeout?: number
): Promise<ArtworkItem[]> => {
  const path = await resourcePath(apiKey, shop, objectId);
  if (!path) return [];

  const response = await steamGridDb.get<SteamGridDbResponse<ArtworkItem[]>>(
    `/${kind}/${path}`,
    {
      ...authorized(apiKey),
      params: query,
      ...(timeout !== undefined && {
        timeout,
        signal: AbortSignal.timeout(timeout),
      }),
      validateStatus: (status) =>
        (status >= 200 && status < 300) || status === 404,
    }
  );

  if (response.status === 404) return [];
  return response.data.data ?? [];
};
