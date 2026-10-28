import { invertSteamTags } from "@shared";
import { HydraApi } from "./hydra-api";
import { logger } from "./logger";

let namesById: Promise<Map<string, string>> | null = null;

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
