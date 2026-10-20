import type { PlayActivityEntry } from "@types";

/** A day counts towards a streak with at least this much play. */
export const STREAK_MIN_PLAY_MS = 60 * 1000;

const pad = (value: number) => String(value).padStart(2, "0");

/** Local calendar date as `YYYY-MM-DD`. */
export const toPlayActivityDate = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const parsePlayActivityDate = (value: string): Date => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

export const getPlayActivityTotal = (entry: PlayActivityEntry | undefined) =>
  entry ? Object.values(entry.games).reduce((sum, ms) => sum + ms, 0) : 0;

export interface PlayStreaks {
  /** Consecutive days with play, ending today, or yesterday when today has none yet. */
  current: number;
  longest: number;
  playedToday: boolean;
}

export const getPlayStreaks = (
  entries: PlayActivityEntry[],
  today = new Date()
): PlayStreaks => {
  const played = new Set(
    entries
      .filter((entry) => getPlayActivityTotal(entry) >= STREAK_MIN_PLAY_MS)
      .map((entry) => entry.date)
  );

  const todayKey = toPlayActivityDate(today);
  const playedToday = played.has(todayKey);

  let current = 0;
  let cursor = playedToday ? today : addDays(today, -1);
  while (played.has(toPlayActivityDate(cursor))) {
    current++;
    cursor = addDays(cursor, -1);
  }

  let longest = 0;
  for (const date of played) {
    if (
      played.has(toPlayActivityDate(addDays(parsePlayActivityDate(date), -1)))
    )
      continue;
    let length = 1;
    let next = addDays(parsePlayActivityDate(date), 1);
    while (played.has(toPlayActivityDate(next))) {
      length++;
      next = addDays(next, 1);
    }
    longest = Math.max(longest, length);
  }

  return { current, longest, playedToday };
};

export interface HeatmapCell {
  date: string;
  totalMs: number;
  /** 0 for no play, then 1–4 by amount. */
  level: 0 | 1 | 2 | 3 | 4;
  isFuture: boolean;
}

const LEVEL_THRESHOLDS_MS = [30, 60, 120].map((minutes) => minutes * 60_000);

const getLevel = (totalMs: number): HeatmapCell["level"] => {
  if (totalMs < STREAK_MIN_PLAY_MS) return 0;
  const above = LEVEL_THRESHOLDS_MS.filter((ms) => totalMs >= ms).length;
  return (above + 1) as HeatmapCell["level"];
};

/**
 * Columns of seven days (Monday first), oldest week first, ending with the
 * week that contains `today`.
 */
export const buildPlayHeatmap = (
  entries: PlayActivityEntry[],
  weeks: number,
  today = new Date()
): HeatmapCell[][] => {
  const byDate = new Map(entries.map((entry) => [entry.date, entry]));
  const todayKey = toPlayActivityDate(today);
  const mondayOffset = (today.getDay() + 6) % 7;
  const firstMonday = addDays(today, -mondayOffset - (weeks - 1) * 7);

  return Array.from({ length: weeks }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => {
      const date = toPlayActivityDate(addDays(firstMonday, week * 7 + day));
      const totalMs = getPlayActivityTotal(byDate.get(date));
      return {
        date,
        totalMs,
        level: getLevel(totalMs),
        isFuture: date > todayKey,
      };
    })
  );
};

/** Total play per game across the entries, most played first. */
export const getMostPlayedInActivity = (
  entries: PlayActivityEntry[]
): [string, number][] => {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    for (const [gameKey, ms] of Object.entries(entry.games)) {
      totals.set(gameKey, (totals.get(gameKey) ?? 0) + ms);
    }
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1]);
};
