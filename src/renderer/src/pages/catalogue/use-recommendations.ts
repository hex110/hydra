import { useCallback, useEffect, useRef, useState } from "react";
import type { RecommendationResponse, TuneOptions } from "@shared";
import { logger } from "@renderer/logger";

const DEBOUNCE_MS = 300;
const CACHE_MS = 10 * 60 * 1000;

const cache = new Map<
  string,
  { at: number; response: RecommendationResponse }
>();

/**
 * Suggestions for the options given. A change waits a moment so a dragged
 * slider asks once, and keeps showing the last answer, flagged as refreshing,
 * until the new one arrives.
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
  const requestRef = useRef(0);
  const [attempt, setAttempt] = useState(0);
  const forceRef = useRef(false);

  useEffect(() => {
    if (!options || !key) return;

    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS && !forceRef.current) {
      setResponse(hit.response);
      setIsRefreshing(false);
      return;
    }

    forceRef.current = false;
    const requestId = ++requestRef.current;
    setIsRefreshing(true);

    const timer = window.setTimeout(
      () => {
        window.electron
          .getRecommendations(options)
          .then((next) => {
            if (requestId !== requestRef.current) return;
            if (!next.failed)
              cache.set(key, { at: Date.now(), response: next });
            setResponse(next);
          })
          .catch((error) => {
            logger.error("Failed to load recommendations", error);
            if (requestId !== requestRef.current) return;
            setResponse((current) =>
              current ? { ...current, failed: true } : null
            );
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

  return { response, isRefreshing, retry };
}
