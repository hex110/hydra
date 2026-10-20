import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildPlayHeatmap,
  getMostPlayedInActivity,
  getPlayStreaks,
  toPlayActivityDate,
} from "./play-activity.js";

const HOUR = 3_600_000;
const day = (date: string, ms: number, gameKey = "steam:1") => ({
  date,
  games: { [gameKey]: ms },
});

// Wednesday 2026-10-21, local time.
const today = new Date(2026, 9, 21, 15, 0);

describe("toPlayActivityDate", () => {
  it("uses the local calendar date", () => {
    assert.equal(
      toPlayActivityDate(new Date(2026, 0, 5, 23, 59)),
      "2026-01-05"
    );
  });
});

describe("getPlayStreaks", () => {
  it("counts the run ending today", () => {
    const streaks = getPlayStreaks(
      [
        day("2026-10-19", HOUR),
        day("2026-10-20", HOUR),
        day("2026-10-21", HOUR),
      ],
      today
    );
    assert.deepEqual(streaks, { current: 3, longest: 3, playedToday: true });
  });

  it("keeps the streak alive until today is over", () => {
    const streaks = getPlayStreaks(
      [day("2026-10-19", HOUR), day("2026-10-20", HOUR)],
      today
    );
    assert.equal(streaks.current, 2);
    assert.equal(streaks.playedToday, false);
  });

  it("breaks on a missed day and ignores a few seconds of play", () => {
    const streaks = getPlayStreaks(
      [
        day("2026-10-10", HOUR),
        day("2026-10-11", HOUR),
        day("2026-10-12", HOUR),
        day("2026-10-13", HOUR),
        day("2026-10-20", 5_000),
        day("2026-10-21", HOUR),
      ],
      today
    );
    assert.deepEqual(streaks, { current: 1, longest: 4, playedToday: true });
  });

  it("has no streak without play", () => {
    assert.deepEqual(getPlayStreaks([], today), {
      current: 0,
      longest: 0,
      playedToday: false,
    });
  });
});

describe("buildPlayHeatmap", () => {
  it("lays out Monday-first weeks ending with the current one", () => {
    const heatmap = buildPlayHeatmap(
      [day("2026-10-21", 3 * HOUR), day("2026-10-13", 20 * 60_000)],
      13,
      today
    );
    assert.equal(heatmap.length, 13);
    assert.ok(heatmap.every((week) => week.length === 7));
    const lastWeek = heatmap[12];
    assert.equal(lastWeek[0].date, "2026-10-19");
    assert.equal(lastWeek[2].date, "2026-10-21");
    assert.equal(lastWeek[2].level, 4);
    assert.equal(lastWeek[3].isFuture, true);
    assert.equal(heatmap[11][1].level, 1);
    assert.equal(heatmap[0][0].date, "2026-07-27");
  });
});

describe("getMostPlayedInActivity", () => {
  it("sums play per game", () => {
    assert.deepEqual(
      getMostPlayedInActivity([
        { date: "2026-10-20", games: { a: 1, b: 5 } },
        { date: "2026-10-21", games: { a: 7 } },
      ]),
      [
        ["a", 8],
        ["b", 5],
      ]
    );
  });
});
