import axios from "axios";

const CACHE_MS = 24 * 60 * 60 * 1000;
const CONCURRENCY = 6;
const TIMEOUT_MS = 8_000;

const cache = new Map<string, { at: number; tier: string | null }>();

const fetchTier = async (appId: string): Promise<string | null> => {
  const cached = cache.get(appId);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.tier;

  try {
    const response = await axios.get<{ tier?: string }>(
      `https://www.protondb.com/api/v1/reports/summaries/${appId}.json`,
      { timeout: TIMEOUT_MS }
    );
    const tier = response.data?.tier ?? null;
    cache.set(appId, { at: Date.now(), tier });
    return tier;
  } catch (error) {
    // ProtonDB answers 404 for a game nobody reported; anything else is retried next time.
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      cache.set(appId, { at: Date.now(), tier: null });
    }
    return null;
  }
};

/** ProtonDB's tier per Steam app id; null when it has no reports or could not be reached. */
export const getProtonDbTiers = async (
  appIds: string[]
): Promise<Record<string, string | null>> => {
  const unique = [...new Set(appIds)];
  const tiers: Record<string, string | null> = {};

  let next = 0;
  const worker = async () => {
    while (next < unique.length) {
      const appId = unique[next++];
      tiers[appId] = await fetchTier(appId);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, unique.length) }, worker)
  );

  return tiers;
};
