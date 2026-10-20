import { useEffect, useState } from "react";
import type { GameNewsItem } from "@shared";
import { logger } from "@renderer/logger";

/** Session cache, keyed by the app ids asked for. */
const cache = new Map<string, GameNewsItem[]>();

/** Steam announcements for the given Steam app ids, newest first. */
export function useGameNews(steamAppIds: string[], countPerApp = 3) {
  const cacheKey = `${countPerApp}:${steamAppIds.join(",")}`;
  const [news, setNews] = useState<GameNewsItem[]>(
    () => cache.get(cacheKey) ?? []
  );
  const [isLoading, setIsLoading] = useState(
    steamAppIds.length > 0 && !cache.has(cacheKey)
  );

  useEffect(() => {
    if (steamAppIds.length === 0) {
      setNews([]);
      setIsLoading(false);
      return;
    }

    const cached = cache.get(cacheKey);
    if (cached) {
      setNews(cached);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    window.electron
      .getGameNews(steamAppIds, countPerApp)
      .then((items) => {
        cache.set(cacheKey, items);
        if (!cancelled) setNews(items);
      })
      .catch((error: unknown) => {
        logger.error("Failed to load game news", error);
        if (!cancelled) setNews([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // The key stands for the id list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  return { news, isLoading };
}
