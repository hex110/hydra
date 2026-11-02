import axios from "axios";
import { getSteamTags, invertSteamTags, type SteamTagWeight } from "@shared";
import type { SteamTag } from "@types";
import { HydraApi } from "./hydra-api";
import { logger } from "./logger";

const ITEMS_URL =
  "https://api.steampowered.com/IStoreBrowseService/GetItems/v1/";
const CACHE_MS = 6 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;
const STORE_BATCH_SIZE = 50;

let namesById: Promise<Map<string, string>> | null = null;
const storeFacts = new Map<
  string,
  { at: number; facts: Promise<SteamStoreFacts | null> }
>();
const EMPTY_FACTS: SteamStoreFacts = {
  tagIds: [],
  reviewPercent: null,
  reviewCount: null,
  releaseDate: null,
};

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

/** What one `GetItems` request tells about a game. */
export interface SteamStoreFacts {
  /** Tag ids, most voted first. */
  tagIds: string[];
  reviewPercent: number | null;
  reviewCount: number | null;
  /** Unix seconds. */
  releaseDate: number | null;
}

interface StoreItem {
  appid?: number;
  tags?: SteamTagWeight[];
  reviews?: {
    summary_filtered?: { review_count?: number; percent_positive?: number };
  };
  release?: { steam_release_date?: number };
}

const positiveNumber = (value: unknown) =>
  typeof value === "number" && value > 0 ? value : null;

const toStoreFacts = (item: StoreItem): SteamStoreFacts => {
  const summary = item.reviews?.summary_filtered;
  const reviewCount = positiveNumber(summary?.review_count);

  return {
    tagIds: [...(item.tags ?? [])]
      .sort((a, b) => b.weight - a.weight)
      .map((tag) => String(tag.tagid)),
    reviewPercent: reviewCount ? (summary?.percent_positive ?? null) : null,
    reviewCount,
    releaseDate: positiveNumber(item.release?.steam_release_date),
  };
};

const requestStoreFacts = (
  appIds: string[]
): Promise<Map<string, SteamStoreFacts> | null> =>
  axios
    .get<{ response?: { store_items?: StoreItem[] } }>(ITEMS_URL, {
      params: {
        input_json: JSON.stringify({
          ids: appIds.map((appid) => ({ appid: Number(appid) })),
          context: { language: "english", country_code: "US" },
          data_request: {
            include_tag_count: 20,
            include_reviews: true,
            include_release: true,
          },
        }),
      },
      timeout: REQUEST_TIMEOUT_MS,
    })
    .then((response) => {
      const byApp = new Map<string, SteamStoreFacts>();
      for (const item of response.data?.response?.store_items ?? []) {
        if (item.appid) byApp.set(String(item.appid), toStoreFacts(item));
      }
      return byApp;
    })
    .catch((error) => {
      logger.error("[SteamTags] Steam store items request failed", error);
      return null;
    });

/**
 * Tags, review summary and release date Steam lists for games, in one request
 * per 50 games not cached. The catalogue lags behind for new releases, so this
 * covers the games it has no tags for yet. A game is null when Steam could not
 * be reached.
 */
export const getSteamStoreFacts = async (
  appIds: string[]
): Promise<Map<string, SteamStoreFacts | null>> => {
  const pending = new Map<string, Promise<SteamStoreFacts | null>>();
  const missing: string[] = [];

  for (const appId of new Set(appIds)) {
    const cached = storeFacts.get(appId);
    if (cached && Date.now() - cached.at < CACHE_MS) {
      pending.set(appId, cached.facts);
    } else {
      missing.push(appId);
    }
  }

  for (let index = 0; index < missing.length; index += STORE_BATCH_SIZE) {
    const batch = missing.slice(index, index + STORE_BATCH_SIZE);
    const request = requestStoreFacts(batch);

    for (const appId of batch) {
      const facts = request.then((byApp) =>
        byApp ? (byApp.get(appId) ?? EMPTY_FACTS) : null
      );
      storeFacts.set(appId, { at: Date.now(), facts });
      pending.set(appId, facts);
      void facts.then((value) => {
        if (value === null) storeFacts.delete(appId);
      });
    }
  }

  return new Map(
    await Promise.all(
      [...pending].map(async ([appId, facts]) => [appId, await facts] as const)
    )
  );
};

/** Tag ids only; null when Steam could not be reached. */
export const getSteamStoreTagIds = async (
  appIds: string[]
): Promise<Map<string, string[] | null>> =>
  new Map(
    [...(await getSteamStoreFacts(appIds))].map(([appId, facts]) => [
      appId,
      facts ? facts.tagIds : null,
    ])
  );

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
    ids = (await getSteamStoreTagIds([objectId])).get(objectId) ?? null;
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
