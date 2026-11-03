import { criticScoresSublevel } from "@main/level";
import { HydraApi } from "./hydra-api";
import { logger } from "./logger";

const CACHE_MS = 30 * 24 * 60 * 60 * 1000;
/** The most ids `/games/shop-details` is asked for at once. */
const BATCH_SIZE = 60;
const CONCURRENT_BATCHES = 2;

const memory = new Map<string, { at: number; score: number | null }>();

const isFresh = (entry: { at: number } | undefined): entry is { at: number } =>
  !!entry && Date.now() - entry.at < CACHE_MS;

const toScore = (value: unknown) =>
  typeof value === "number" && value > 0 ? value : null;

/** Keeps Metacritic scores another request already fetched, e.g. with a game's details. */
export const rememberCriticScores = async (
  scores: Map<string, number | null | undefined>
) => {
  const at = Date.now();
  const batch = criticScoresSublevel.batch();
  for (const [appId, score] of scores) {
    const entry = { at, score: toScore(score) };
    memory.set(appId, entry);
    batch.put(appId, entry);
  }
  await batch.write().catch((error) => {
    logger.warn("[CriticScores] Could not store scores", error);
  });
};

const requestBatch = async (appIds: string[]) => {
  try {
    const entries = await HydraApi.post<
      {
        objectId: string;
        data?: { data?: { metacritic?: { score?: number } } | null } | null;
      }[]
    >(
      "/games/shop-details",
      { shop: "steam", objectIds: appIds, language: "en" },
      { needsAuth: false }
    );
    if (!Array.isArray(entries)) return null;

    const scores = new Map<string, number | null>(
      appIds.map((appId) => [appId, null])
    );
    for (const entry of entries) {
      scores.set(entry.objectId, toScore(entry.data?.data?.metacritic?.score));
    }
    return scores;
  } catch (error) {
    logger.warn("[CriticScores] Shop details request failed", error);
    return null;
  }
};

/**
 * Metacritic scores for Steam games, 60 to a request through Hydra's shop
 * details, kept for 30 days in memory and on disk. Null when Metacritic has
 * none or the request failed (a failure is not stored).
 */
export const getCriticScores = async (
  appIds: string[]
): Promise<Map<string, number | null>> => {
  const result = new Map<string, number | null>();
  const missing: string[] = [];

  for (const appId of new Set(appIds)) {
    let entry = memory.get(appId);
    if (!isFresh(entry)) {
      entry = await criticScoresSublevel.get(appId).catch(() => undefined);
      if (entry) memory.set(appId, entry);
    }
    if (isFresh(entry)) result.set(appId, entry.score);
    else missing.push(appId);
  }

  const batches: string[][] = [];
  for (let index = 0; index < missing.length; index += BATCH_SIZE) {
    batches.push(missing.slice(index, index + BATCH_SIZE));
  }

  const worker = async () => {
    for (let batch = batches.shift(); batch; batch = batches.shift()) {
      const scores = await requestBatch(batch);
      if (!scores) {
        batch.forEach((appId) => result.set(appId, null));
        continue;
      }
      await rememberCriticScores(scores);
      scores.forEach((score, appId) => result.set(appId, score));
    }
  };
  await Promise.all(Array.from({ length: CONCURRENT_BATCHES }, worker));

  return result;
};
