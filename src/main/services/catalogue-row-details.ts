import type { GameRepack, GameShop, HowLongToBeatCategory } from "@types";
import { downloadSourcesSublevel } from "@main/level";
import {
  buildCatalogueRowDetails,
  filterDownloadableRepacks,
  getMatchingDownloadSizes,
  parseBytes,
  parseHowLongToBeat,
  type CatalogueRowDetails,
} from "@shared";
import { HydraApi } from "./hydra-api";

const CACHE_MS = 60 * 60 * 1000;
const MAX_GAMES = 60;
const CONCURRENCY = 6;

const requestOptions = { needsAuth: false } as const;
const cache = new Map<string, { at: number; details: CatalogueRowDetails }>();

interface SteamDetailsEntry {
  objectId: string;
  data?: {
    data?: {
      metacritic?: { score?: number };
      screenshots?: { path_thumbnail?: string; path_full?: string }[];
    };
  } | null;
}

const settle = <T>(promise: Promise<T>): Promise<T | undefined> =>
  promise.catch(() => undefined);

const fetchSteamDetails = async (objectIds: string[]) => {
  if (objectIds.length === 0) return new Map();
  const entries = await settle(
    HydraApi.post<SteamDetailsEntry[]>(
      "/games/shop-details",
      { shop: "steam", objectIds, language: "en" },
      requestOptions
    )
  );

  return new Map(
    (Array.isArray(entries) ? entries : []).map((entry) => [
      entry.objectId,
      entry.data?.data ?? null,
    ])
  );
};

interface CatalogueRowGame {
  shop: GameShop;
  objectId: string;
  title: string;
}

const fetchGameExtras = async (
  { shop, objectId, title }: CatalogueRowGame,
  sourceIds: string[]
) => {
  const base = `/games/${shop}/${encodeURIComponent(objectId)}`;
  const [howLongToBeat, repacks] = await Promise.all([
    shop === "launchbox"
      ? Promise.resolve(null)
      : settle(
          HydraApi.get<HowLongToBeatCategory[] | null>(
            `${base}/how-long-to-beat`,
            null,
            requestOptions
          )
        ),
    sourceIds.length === 0
      ? Promise.resolve([] as GameRepack[])
      : settle(
          HydraApi.get<GameRepack[]>(
            `${base}/download-sources`,
            { take: 100, skip: 0, downloadSourceIds: sourceIds },
            requestOptions
          )
        ),
  ]);

  return {
    howLongToBeatHours: parseHowLongToBeat(howLongToBeat)?.mainStory ?? null,
    downloadSizes: getMatchingDownloadSizes(
      title,
      filterDownloadableRepacks(Array.isArray(repacks) ? repacks : []).map(
        (repack) => ({ title: repack.title, size: parseBytes(repack.fileSize) })
      )
    ),
  };
};

/**
 * Score, How Long to Beat, download size and screenshots for catalogue rows.
 * Kept in memory for an hour; the catalogue asks again on every page.
 */
export const getCatalogueRowDetails = async (
  games: CatalogueRowGame[]
): Promise<Record<string, CatalogueRowDetails>> => {
  const result: Record<string, CatalogueRowDetails> = {};
  const missing: (CatalogueRowGame & { key: string })[] = [];

  for (const game of games.slice(0, MAX_GAMES)) {
    const key = `${game.shop}:${game.objectId}`;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_MS) {
      result[key] = cached.details;
    } else if (!missing.some((item) => item.key === key)) {
      missing.push({ ...game, key });
    }
  }

  if (missing.length === 0) return result;

  const [steamDetails, sources] = await Promise.all([
    fetchSteamDetails(
      missing
        .filter((game) => game.shop === "steam")
        .map((game) => game.objectId)
    ),
    downloadSourcesSublevel
      .values()
      .all()
      .catch(() => []),
  ]);
  const sourceIds = sources.map((source) => source.id);

  const queue = [...missing];
  const worker = async () => {
    for (let game = queue.shift(); game; game = queue.shift()) {
      const extras = await fetchGameExtras(game, sourceIds);
      const details = buildCatalogueRowDetails({
        steamDetails: steamDetails.get(game.objectId),
        ...extras,
      });
      cache.set(game.key, { at: Date.now(), details });
      result[game.key] = details;
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return result;
};
