import { useCallback, useEffect, useRef, useState } from "react";
import type { RecommendationResponse, TuneOptions } from "@shared";
import { logger } from "@renderer/logger";
import {
  hashKey,
  readCatalogueSnapshot,
  writeCatalogueSnapshot,
} from "./catalogue-snapshots";

const DEBOUNCE_MS = 300;
const CACHE_MS = 10 * 60 * 1000;

const cache = new Map<
  string,
  { at: number; response: RecommendationResponse }
>();

/** Forgets the kept answers, e.g. after a game is logged as played elsewhere. */
export const clearRecommendationsCache = () => cache.clear();

const hasResults = (response: RecommendationResponse | null) =>
  !!response && response.results.length > 0;

/**
 * Suggestions for the options given. What was shown last time for the same
 * options appears at once, from memory or from disk, flagged as refreshing
 * until the new answer arrives. A change waits a moment so a dragged slider
 * asks once. When the new answer fails, the old one stays and `staleAt` says
 * how old it is.
 */
export function useRecommendations(
  options: TuneOptions | null,
  { debounce = true }: { debounce?: boolean } = {}
) {
  const key = options ? JSON.stringify(options) : null;
  const cached = key ? cache.get(key) : undefined;

  const [response, setResponse] = useState<RecommendationResponse | null>(
    cached?.response ?? null
  );
  const [isRefreshing, setIsRefreshing] = useState(!cached && key !== null);
  const [staleAt, setStaleAt] = useState<number | null>(null);
  const shownAtRef = useRef<number | null>(cached?.at ?? null);
  const requestRef = useRef(0);
  const [attempt, setAttempt] = useState(0);
  const forceRef = useRef(false);

  useEffect(() => {
    if (!options || !key) return;

    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS && !forceRef.current) {
      setResponse(hit.response);
      shownAtRef.current = hit.at;
      setStaleAt(null);
      setIsRefreshing(false);
      return;
    }

    forceRef.current = false;
    const requestId = ++requestRef.current;
    const snapshotKey = `recommendations:${hashKey(key)}`;
    setIsRefreshing(true);

    if (hit) {
      setResponse(hit.response);
      shownAtRef.current = hit.at;
    } else {
      void readCatalogueSnapshot<RecommendationResponse>(snapshotKey).then(
        (snapshot) => {
          if (!snapshot || requestId !== requestRef.current) return;
          setResponse((current) => {
            if (hasResults(current)) return current;
            shownAtRef.current = snapshot.at;
            return snapshot.data;
          });
        }
      );
    }

    const keepOld = () => {
      setResponse((current) => {
        if (hasResults(current)) {
          setStaleAt(shownAtRef.current);
          return current;
        }
        return current ? { ...current, failed: true } : null;
      });
    };

    const timer = window.setTimeout(
      () => {
        window.electron
          .getRecommendations(options)
          .then((next) => {
            if (requestId !== requestRef.current) return;
            if (next.failed) {
              keepOld();
              if (!hasResults(next)) return;
            }
            const at = Date.now();
            if (!next.failed) {
              cache.set(key, { at, response: next });
              writeCatalogueSnapshot(snapshotKey, next);
            }
            shownAtRef.current = at;
            setStaleAt(null);
            setResponse(next);
          })
          .catch((error) => {
            logger.error("Failed to load recommendations", error);
            if (requestId === requestRef.current) keepOld();
          })
          .finally(() => {
            if (requestId === requestRef.current) setIsRefreshing(false);
          });
      },
      debounce && !hit ? DEBOUNCE_MS : 0
    );

    return () => window.clearTimeout(timer);
    // The options are identified by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const retry = useCallback(() => {
    if (key) cache.delete(key);
    forceRef.current = true;
    setAttempt((value) => value + 1);
  }, [key]);

  return { response, isRefreshing, staleAt, retry };
}
