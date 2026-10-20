import { useCallback, useEffect, useMemo, useState } from "react";
import type { PlayActivityEntry } from "@types";
import { getMostPlayedInActivity, toPlayActivityDate } from "@shared";

export const HEATMAP_WEEKS = 13;
const RECENT_DAYS = 30;

const daysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
};

/** Play per day for the heatmap, refreshed when the library changes. */
export function usePlayActivity() {
  const [entries, setEntries] = useState<PlayActivityEntry[]>([]);

  const load = useCallback(() => {
    window.electron
      .getPlayActivity(toPlayActivityDate(daysAgo(HEATMAP_WEEKS * 7)))
      .then(setEntries)
      .catch(() => setEntries([]));
  }, []);

  useEffect(() => {
    load();
    const unsubscribe = window.electron.onLibraryBatchComplete(load);
    window.addEventListener("focus", load);
    // Playtime ticks don't announce themselves; pick up a running game's time.
    const interval = window.setInterval(load, 5 * 60_000);
    return () => {
      unsubscribe();
      window.removeEventListener("focus", load);
      window.clearInterval(interval);
    };
  }, [load]);

  const recentPlayByKey = useMemo(() => {
    const since = toPlayActivityDate(daysAgo(RECENT_DAYS));
    return new Map(
      getMostPlayedInActivity(entries.filter((entry) => entry.date >= since))
    );
  }, [entries]);

  return { entries, recentPlayByKey };
}
