import { useEffect, useMemo, useState } from "react";
import { orderBy } from "lodash-es";

import { levelDBService } from "@renderer/services/leveldb.service";
import { logger } from "@renderer/logger";
import {
  fetchSimilarGames,
  type SimilarGame,
  type SimilarGamesGet,
} from "@renderer/hooks/similar-games";
import type { DownloadSource } from "@types";
import {
  getOwnedKeys,
  getSuggestionSeeds,
  rankSuggestions,
  type HomeGame,
  type RankedSuggestion,
} from "./home-sections";

const cache = new Map<string, RankedSuggestion<SimilarGame>[]>();

/** Games similar to what you played most, without the ones you own. */
export function useHomeSuggestions<T extends HomeGame>(
  games: T[],
  recentPlayByKey: Map<string, number>
) {
  const seeds = useMemo(
    () => getSuggestionSeeds(games, recentPlayByKey),
    [games, recentPlayByKey]
  );
  const ownedKeys = useMemo(() => getOwnedKeys(games), [games]);
  const cacheKey = seeds
    .map((seed) => {
      const identity = seed.catalogueGame ?? seed;
      return `${identity.shop}:${identity.objectId}`;
    })
    .join("|");

  const [suggestions, setSuggestions] = useState(
    () => cache.get(cacheKey) ?? []
  );
  const [isLoading, setIsLoading] = useState(
    seeds.length > 0 && !cache.has(cacheKey)
  );

  useEffect(() => {
    const cached = cache.get(cacheKey);
    if (cached) {
      setSuggestions(
        cached.filter(
          ({ game }) => !ownedKeys.has(`${game.shop}:${game.objectId}`)
        )
      );
      setIsLoading(false);
      return;
    }
    if (seeds.length === 0) {
      setSuggestions([]);
      setIsLoading(false);
      return;
    }

    let current = true;
    setIsLoading(true);

    const get: SimilarGamesGet = (path, options) =>
      window.electron.hydraApi.get<unknown>(path, options);

    const getSteamSimilar = (appId: string) =>
      window.electron.getSteamSimilarGames(appId);

    const load = async () => {
      const sources = (await levelDBService.values(
        "downloadSources"
      )) as DownloadSource[];
      const downloadSourceIds = orderBy(sources, "createdAt", "desc").map(
        (source) => source.id
      );

      const results = await Promise.all(
        seeds.map(async (seed) => {
          const identity = seed.catalogueGame ?? seed;
          const similar = await fetchSimilarGames(
            {
              shop: identity.shop as SimilarGame["shop"],
              objectId: identity.objectId,
            },
            get,
            downloadSourceIds,
            getSteamSimilar
          ).catch(() => [] as SimilarGame[]);
          return { seedTitle: seed.title ?? "", games: similar };
        })
      );

      const ranked = rankSuggestions(results, ownedKeys);
      cache.set(cacheKey, ranked);
      if (current) setSuggestions(ranked);
    };

    load()
      .catch((error) => logger.error("Failed to load suggestions", error))
      .finally(() => {
        if (current) setIsLoading(false);
      });

    return () => {
      current = false;
    };
    // Seeds are identified by cacheKey; ownedKeys only filters cached results.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  return { suggestions, isLoading, hasSeeds: seeds.length > 0 };
}
