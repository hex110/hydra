import type { PlayActivityEntry } from "@types";

/** The first day (`YYYY-MM-DD`) any of the game's copies was played. */
export const findFirstPlayDay = (
  entries: PlayActivityEntry[],
  gameKeys: string[]
): string | null => {
  const keys = new Set(gameKeys);
  let first: string | null = null;
  for (const entry of entries) {
    if (!Object.keys(entry.games).some((key) => keys.has(key))) continue;
    if (first === null || entry.date < first) first = entry.date;
  }
  return first;
};
