import axios from "axios";
import { parseStoreItem, type StoreItem } from "@shared";
import { steamStoreItemsSublevel } from "@main/level";
import { logger } from "./logger";

const ITEMS_URL =
  "https://api.steampowered.com/IStoreBrowseService/GetItems/v1/";
const CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;
const BATCH_SIZE = 50;
const CONCURRENT_BATCHES = 3;

const memory = new Map<string, { at: number; item: StoreItem | null }>();

const isFresh = (entry: { at: number } | undefined): entry is { at: number } =>
  !!entry && Date.now() - entry.at < CACHE_MS;

/** Null when Steam could not be reached; ids it does not list come back as an empty map entry. */
const requestBatch = async (
  appIds: string[]
): Promise<Map<string, StoreItem> | null> => {
  try {
    const response = await axios.get<{
      response?: { store_items?: Parameters<typeof parseStoreItem>[0][] };
    }>(ITEMS_URL, {
      params: {
        input_json: JSON.stringify({
          ids: appIds.map((appid) => ({ appid: Number(appid) })),
          context: { language: "english", country_code: "US" },
          data_request: {
            include_reviews: true,
            include_release: true,
            include_tag_count: 20,
            include_basic_info: true,
            include_assets: true,
          },
        }),
      },
      timeout: REQUEST_TIMEOUT_MS,
    });

    const items = new Map<string, StoreItem>();
    for (const raw of response.data?.response?.store_items ?? []) {
      const item = parseStoreItem(raw);
      if (item) items.set(item.appId, item);
    }
    return items;
  } catch (error) {
    logger.warn("[SteamStoreItems] Steam store request failed", error);
    return null;
  }
};

/**
 * Steam's store page data for games (reviews, release, tags, player
 * categories, developers, header image), 50 ids to a request, kept for seven
 * days in memory and on disk. A game is null when Steam does not list it or
 * could not be reached.
 */
export const getStoreItems = async (
  appIds: string[]
): Promise<Map<string, StoreItem | null>> => {
  const result = new Map<string, StoreItem | null>();
  const unique = [...new Set(appIds)];

  const unknown = unique.filter((appId) => {
    const cached = memory.get(appId);
    if (isFresh(cached)) {
      result.set(appId, cached.item);
      return false;
    }
    return true;
  });

  const stored = await steamStoreItemsSublevel
    .getMany(unknown)
    .catch(() => [] as undefined[]);
  const missing = unknown.filter((appId, index) => {
    const entry = stored[index];
    if (isFresh(entry)) {
      memory.set(appId, entry);
      result.set(appId, entry.item);
      return false;
    }
    return true;
  });

  const batches: string[][] = [];
  for (let index = 0; index < missing.length; index += BATCH_SIZE) {
    batches.push(missing.slice(index, index + BATCH_SIZE));
  }

  let next = 0;
  const worker = async () => {
    while (next < batches.length) {
      const batch = batches[next++];
      const items = await requestBatch(batch);

      if (!items) {
        for (const appId of batch) result.set(appId, null);
        continue;
      }

      const at = Date.now();
      const writes: {
        type: "put";
        key: string;
        value: { at: number; item: StoreItem | null };
      }[] = [];
      for (const appId of batch) {
        const item = items.get(appId) ?? null;
        memory.set(appId, { at, item });
        result.set(appId, item);
        writes.push({
          type: "put" as const,
          key: appId,
          value: { at, item },
        });
      }
      await steamStoreItemsSublevel
        .batch(writes)
        .catch((error) =>
          logger.warn("[SteamStoreItems] Could not keep store items", error)
        );
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENT_BATCHES, batches.length) }, worker)
  );

  return result;
};
