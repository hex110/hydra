import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FULL_SCAN_INTERVAL_MS,
  RECENTLY_RUNNING_MS,
  selectAchievementScanGames,
} from "./achievement-scan-schedule.ts";

const games = ["a", "b", "c"];
const options = (
  now: number,
  lastFullScanAt: number,
  running: string[],
  lastSeenRunning = new Map<string, number>()
) => ({
  now,
  lastFullScanAt,
  keyOf: (game: string) => game,
  isRunning: (game: string) => running.includes(game),
  lastSeenRunning,
});

describe("selectAchievementScanGames", () => {
  it("scans every game when the full scan is due", () => {
    const result = selectAchievementScanGames(
      games,
      options(FULL_SCAN_INTERVAL_MS, 0, [])
    );
    assert.deepEqual(result, { games, fullScan: true });
  });

  it("scans only running games between full scans", () => {
    const result = selectAchievementScanGames(games, options(1_000, 0, ["b"]));
    assert.deepEqual(result, { games: ["b"], fullScan: false });
  });

  it("keeps a game that just closed on the fast path for a while", () => {
    const seen = new Map([["c", 0]]);
    assert.deepEqual(
      selectAchievementScanGames(games, options(5_000, 0, [], seen)).games,
      ["c"]
    );
    assert.deepEqual(
      selectAchievementScanGames(
        games,
        options(RECENTLY_RUNNING_MS + 1, RECENTLY_RUNNING_MS, [], seen)
      ).games,
      []
    );
  });
});
