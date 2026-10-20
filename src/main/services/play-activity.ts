import type { PlayActivityEntry } from "@types";
import { playActivitySublevel } from "@main/level";
import { toPlayActivityDate } from "@shared";
import { logger } from "./logger";

let writes: Promise<void> = Promise.resolve();

/** Adds play to a game's total for the day it happened (local time). */
export const recordPlayActivity = (
  gameKey: string,
  milliseconds: number,
  at = new Date()
): Promise<void> => {
  if (!(milliseconds > 0)) return writes;

  const date = toPlayActivityDate(at);
  writes = writes
    .then(async () => {
      const day = (await playActivitySublevel.get(date)) ?? {};
      day[gameKey] = (day[gameKey] ?? 0) + milliseconds;
      await playActivitySublevel.put(date, day);
    })
    .catch((error) => logger.error("Failed to record play activity", error));

  return writes;
};

/** Days with play from `sinceDate` (`YYYY-MM-DD`) on, oldest first. */
export const getPlayActivity = async (
  sinceDate: string
): Promise<PlayActivityEntry[]> => {
  const entries = await playActivitySublevel.iterator({ gte: sinceDate }).all();
  return entries.map(([date, games]) => ({ date, games }));
};
