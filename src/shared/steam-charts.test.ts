import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-ignore The Node ESM test runner requires the source extension.
import * as charts from "./steam-charts.ts";

const {
  parseMostPlayed,
  parsePlayingNow,
  getMovement,
  getTrending,
  rankSnapshots,
  toSnapshotDate,
  windowDates,
} = charts;

const rank = (r: number, appId: string, lastWeekRank: number | null) => ({
  rank: r,
  appId,
  lastWeekRank,
  peak: 1,
  concurrent: null,
});

describe("parseMostPlayed", () => {
  it("reads ranks, with -1 as a new entry", () => {
    const parsed = parseMostPlayed({
      response: {
        rollup_date: 1793577600,
        ranks: [
          { rank: 1, appid: 730, last_week_rank: 1, peak_in_game: 100 },
          { rank: 4, appid: 4115450, last_week_rank: -1, peak_in_game: 80 },
        ],
      },
    });
    assert.equal(parsed?.ranks.length, 2);
    assert.equal(parsed?.ranks[0].appId, "730");
    assert.equal(parsed?.ranks[1].lastWeekRank, null);
  });

  it("is null for an empty or broken answer", () => {
    assert.equal(parseMostPlayed({ response: {} }), null);
    assert.equal(parseMostPlayed(null), null);
  });
});

describe("parsePlayingNow", () => {
  it("reads players now and the day's peak", () => {
    const parsed = parsePlayingNow({
      response: {
        last_update: 5,
        ranks: [
          { rank: 1, appid: 730, concurrent_in_game: 9, peak_in_game: 10 },
        ],
      },
    });
    assert.equal(parsed?.ranks[0].concurrent, 9);
    assert.equal(parsed?.ranks[0].peak, 10);
  });
});

describe("movement and trending", () => {
  it("counts places gained, and marks new entries", () => {
    assert.deepEqual(getMovement(rank(5, "a", 12)), {
      places: 7,
      isNew: false,
    });
    assert.deepEqual(getMovement(rank(5, "a", 3)), {
      places: -2,
      isNew: false,
    });
    assert.deepEqual(getMovement(rank(5, "a", null)), {
      places: null,
      isNew: true,
    });
  });

  it("keeps games that gained five places or are new, by places gained", () => {
    const trending = getTrending([
      rank(1, "steady", 1),
      rank(2, "almost", 6),
      rank(3, "small", 8),
      rank(4, "big", 24),
      rank(5, "new", null),
    ]);
    assert.deepEqual(
      trending.map((entry: { appId: string }) => entry.appId),
      ["new", "big", "small"]
    );
  });
});

describe("rankSnapshots", () => {
  const snapshots = {
    "2026-11-01": ["a", "b", "c"],
    "2026-11-02": ["a", "b"],
  };

  it("sums 101 − rank over the days that have a snapshot", () => {
    const { rows, days } = rankSnapshots(snapshots, [
      "2026-11-03",
      "2026-11-02",
      "2026-11-01",
    ]);
    assert.equal(days, 2);
    assert.deepEqual(
      rows.map((row: { appId: string }) => row.appId),
      ["a", "b", "c"]
    );
    assert.equal(rows[0].score, 200);
    assert.equal(rows[2].days, 1);
  });
});

describe("dates", () => {
  it("formats a rollup date and walks back a window", () => {
    assert.equal(toSnapshotDate(1793577600), "2026-11-02");
    assert.deepEqual(windowDates("2026-11-02", 3), [
      "2026-11-02",
      "2026-11-01",
      "2026-10-31",
    ]);
  });
});
