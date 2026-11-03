import { useEffect } from "react";
import { logger } from "@renderer/logger";

/** Games counted as shown in this run of Hydra, so a re-render doesn't count them twice. */
const counted = new Set<string>();

/**
 * Notes that suggested games were shown. A game shown many times and never
 * opened slowly sinks in the suggestions; opening it forgets the count.
 */
export function useRecordImpressions(appIds: readonly string[]) {
  const key = appIds.join(",");

  useEffect(() => {
    const fresh = appIds.filter((appId) => !counted.has(appId));
    if (fresh.length === 0) return;
    // Counted after a moment on screen, not while the list is still settling.
    const timer = window.setTimeout(() => {
      fresh.forEach((appId) => counted.add(appId));
      window.electron
        .recordCatalogueImpressions(fresh)
        .catch((error) => logger.warn("Could not record impressions", error));
    }, 1000);
    return () => window.clearTimeout(timer);
    // The list is identified by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
