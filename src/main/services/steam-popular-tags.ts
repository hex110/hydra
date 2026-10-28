import axios from "axios";
import type { SteamTag } from "@types";
import { logger } from "./logger";

const URL = "https://store.steampowered.com/tagdata/populartags/english";
const CACHE_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;

let cached: { at: number; tags: Promise<SteamTag[]> } | null = null;

/** Steam's tags, most popular first. Empty when Steam could not be reached. */
export const getSteamPopularTags = (): Promise<SteamTag[]> => {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.tags;

  const tags = axios
    .get<{ tagid: number; name: string }[]>(URL, {
      timeout: REQUEST_TIMEOUT_MS,
    })
    .then((response) =>
      (Array.isArray(response.data) ? response.data : []).map((tag) => ({
        id: tag.tagid,
        name: tag.name,
      }))
    )
    .catch((error) => {
      logger.error("[SteamTags] Could not load popular tags", error);
      cached = null;
      return [];
    });

  cached = { at: Date.now(), tags };
  return tags;
};
