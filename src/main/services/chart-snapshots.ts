import { rankSnapshots, windowDates, type SnapshotRankingRow } from "@shared";
import { chartSnapshotsSublevel } from "@main/level";
import { logger } from "./logger";

const KEEP_DAYS = 120;

/** Stores a day's most played games, once per date, and drops what is older than 120 days. */
export const recordChartSnapshot = async (date: string, appIds: string[]) => {
  try {
    const existing = await chartSnapshotsSublevel
      .get(date)
      .catch(() => undefined);
    if (existing) return;

    await chartSnapshotsSublevel.put(date, appIds);

    const oldest = windowDates(date, KEEP_DAYS).at(-1)!;
    const stale: string[] = [];
    for await (const key of chartSnapshotsSublevel.keys({ lt: oldest })) {
      stale.push(key);
    }
    if (stale.length > 0) {
      await chartSnapshotsSublevel.batch(
        stale.map((key) => ({ type: "del" as const, key }))
      );
    }
  } catch (error) {
    logger.warn("[ChartSnapshots] Could not record today's chart", error);
  }
};

/** The first day Hydra recorded, and how many days it holds. */
export const getSnapshotCoverage = async () => {
  const dates: string[] = [];
  for await (const key of chartSnapshotsSublevel.keys()) dates.push(key);
  dates.sort();
  return {
    since: dates[0] ?? null,
    last: dates.at(-1) ?? null,
    days: dates.length,
  };
};

/** Games ranked by the sum of `101 − rank` over the recorded days of the last `days` days. */
export const getSnapshotRanking = async (
  days: number
): Promise<{
  rows: SnapshotRankingRow[];
  days: number;
  since: string | null;
}> => {
  const { since, last } = await getSnapshotCoverage();
  if (!last) return { rows: [], days: 0, since: null };

  const dates = windowDates(last, days);
  const snapshots: Record<string, string[]> = {};
  const found = await chartSnapshotsSublevel.getMany(dates).catch(() => []);
  dates.forEach((date, index) => {
    const ranked = found[index];
    if (ranked) snapshots[date] = ranked;
  });

  return { ...rankSnapshots(snapshots, dates), since };
};
