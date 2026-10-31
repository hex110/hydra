/** Games not running are scanned this often; a running game every tick. */
export const FULL_SCAN_INTERVAL_MS = 30_000;
/** A game stays on the fast path this long after it was last seen running. */
export const RECENTLY_RUNNING_MS = 60_000;

/**
 * Which games the achievement watcher reads this tick. Unlocks happen while a
 * game runs (and are written as it closes), so those are read every tick and
 * the rest only on a full scan.
 */
export const selectAchievementScanGames = <T>(
  games: T[],
  options: {
    now: number;
    lastFullScanAt: number;
    keyOf: (game: T) => string;
    isRunning: (game: T) => boolean;
    lastSeenRunning: Map<string, number>;
  }
): { games: T[]; fullScan: boolean } => {
  const { now, keyOf, isRunning, lastSeenRunning } = options;
  for (const game of games)
    if (isRunning(game)) lastSeenRunning.set(keyOf(game), now);
  for (const [key, seenAt] of lastSeenRunning)
    if (now - seenAt > RECENTLY_RUNNING_MS) lastSeenRunning.delete(key);

  if (now - options.lastFullScanAt >= FULL_SCAN_INTERVAL_MS)
    return { games, fullScan: true };

  return {
    games: games.filter((game) => lastSeenRunning.has(keyOf(game))),
    fullScan: false,
  };
};
