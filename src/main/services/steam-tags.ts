import axios from "axios";
import { getSteamTags, invertSteamTags, type SteamTagWeight } from "@shared";
import type { SteamTag } from "@types";
import { HydraApi } from "./hydra-api";
import { logger } from "./logger";

const ITEMS_URL =
  "https://api.steampowered.com/IStoreBrowseService/GetItems/v1/";
const CACHE_MS = 6 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;

let namesById: Promise<Map<string, string>> | null = null;
const storeTags = new Map<
  string,
  { at: number; ids: Promise<string[] | null> }
>();

/** Steam tag id → English name. Fetched once per session; a failure is retried next call. */
export const getSteamTagNamesById = (): Promise<Map<string, string>> => {
  namesById ??= HydraApi.get<Record<string, number>>(
    "/catalogue/steam/tags",
    { language: "en" },
    { needsAuth: false }
  )
    .then(invertSteamTags)
    .catch((error) => {
      logger.error("[SteamTags] Could not load tag names", error);
      namesById = null;
      return new Map<string, string>();
    });

  return namesById;
};

/**
 * Tag ids Steam itself lists for a game, most voted first. The catalogue lags
 * behind for new releases, so this covers the games it has no tags for yet.
 * Null when Steam could not be reached.
 */
const fetchSteamStoreTagIds = (appId: string): Promise<string[] | null> => {
  const cached = storeTags.get(appId);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.ids;

  const ids = axios
    .get<{ response?: { store_items?: { tags?: SteamTagWeight[] }[] } }>(
      ITEMS_URL,
      {
        params: {
          input_json: JSON.stringify({
            ids: [{ appid: Number(appId) }],
            context: { language: "english", country_code: "US" },
            data_request: { include_tag_count: 20 },
          }),
        },
        timeout: REQUEST_TIMEOUT_MS,
      }
    )
    .then((response) => {
      const tags = response.data?.response?.store_items?.[0]?.tags ?? [];
      return [...tags]
        .sort((a, b) => b.weight - a.weight)
        .map((tag) => String(tag.tagid));
    })
    .catch((error) => {
      logger.error(`[SteamTags] Steam tags for ${appId} failed`, error);
      storeTags.delete(appId);
      return null;
    });

  storeTags.set(appId, { at: Date.now(), ids });
  return ids;
};

/**
 * A game's most voted Steam tags: the catalogue's tags, or Steam's own for
 * a Steam game the catalogue has none for. `complete` is false when a source
 * could not be reached, so callers can ask again soon.
 */
export const getGameSteamTags = async (
  shop: string,
  objectId: string,
  catalogueTagIds: (string | number)[] | null | undefined
): Promise<{ tags: SteamTag[]; complete: boolean }> => {
  let ids: (string | number)[] | null = catalogueTagIds ?? [];

  if (ids.length === 0 && shop === "steam") {
    ids = await fetchSteamStoreTagIds(objectId);
  }

  const names = await getSteamTagNamesById();

  return {
    tags: getSteamTags(ids, names),
    complete: ids !== null && names.size > 0,
  };
};

/** Same as {@link getGameSteamTags}, reading the catalogue record itself. */
export const getSteamTagsForGame = async (shop: string, objectId: string) => {
  const record = await HydraApi.get<{ tags?: (string | number)[] } | null>(
    `/games/${shop}/${encodeURIComponent(objectId)}`,
    null,
    { needsAuth: false }
  ).catch(() => null);

  return getGameSteamTags(shop, objectId, record?.tags);
};
