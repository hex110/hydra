import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SteamGameHistory } from "@types";

import {
  firstUnlockTime,
  mergeAchievements,
  needsAchievementFetch,
  steamActivityToRecord,
  steamPlayTimeToStore,
  toHistoryEntry,
} from "./steam-history-core.js";

const DAY = 86_400_000;
const entry = (
  overrides: Partial<SteamGameHistory> = {}
): SteamGameHistory => ({
  appId: "1",
  name: "Game",
  playtimeMinutes: 100,
  playtimeLinuxMinutes: 0,
  playtimeDeckMinutes: 0,
  lastPlayedAt: 1_000,
  achievements: null,
  syncedAt: 10 * DAY,
  ...overrides,
});

describe("steamActivityToRecord", () => {
  it("records nothing on the first sync", () => {
    assert.equal(
      steamActivityToRecord({
        previous: null,
        current: entry(),
        hydraMsSincePrevious: 0,
      }),
      null
    );
  });

  it("dates new play to the last day the game was played", () => {
    const lastPlayedAt = (11 * DAY) / 1000;
    const result = steamActivityToRecord({
      previous: entry({ playtimeMinutes: 100 }),
      current: entry({
        playtimeMinutes: 160,
        lastPlayedAt,
        syncedAt: 13 * DAY,
      }),
      hydraMsSincePrevious: 0,
    });
    assert.equal(result?.milliseconds, 60 * 60_000);
    assert.equal(result?.at.getTime(), 11 * DAY);
  });

  it("subtracts what Hydra recorded itself", () => {
    const result = steamActivityToRecord({
      previous: entry({ playtimeMinutes: 100 }),
      current: entry({ playtimeMinutes: 160, syncedAt: 12 * DAY }),
      hydraMsSincePrevious: 45 * 60_000,
    });
    assert.equal(result?.milliseconds, 15 * 60_000);
  });

  it("records nothing when Hydra already covers the delta", () => {
    assert.equal(
      steamActivityToRecord({
        previous: entry({ playtimeMinutes: 100 }),
        current: entry({ playtimeMinutes: 130 }),
        hydraMsSincePrevious: 30 * 60_000,
      }),
      null
    );
  });
});

describe("needsAchievementFetch", () => {
  const owned = {
    appid: 1,
    playtime_forever: 100,
    rtime_last_played: 1_000,
    has_community_visible_stats: true,
  };

  it("skips games without stats or playtime", () => {
    assert.equal(
      needsAchievementFetch(
        { ...owned, has_community_visible_stats: false },
        null
      ),
      false
    );
    assert.equal(
      needsAchievementFetch({ ...owned, playtime_forever: 0 }, null),
      false
    );
  });

  it("fetches new games and games played since", () => {
    assert.equal(needsAchievementFetch(owned, null), true);
    assert.equal(
      needsAchievementFetch(owned, entry({ achievements: [] })),
      false
    );
    assert.equal(
      needsAchievementFetch(
        { ...owned, playtime_forever: 120 },
        entry({ achievements: [] })
      ),
      true
    );
  });
});

describe("achievements and playtime", () => {
  it("joins unlock times with the schema's names", () => {
    const merged = mergeAchievements(
      [
        { apiname: "A", achieved: 1, unlocktime: 50 },
        { apiname: "B", achieved: 0, unlocktime: 0 },
      ],
      [{ name: "A", displayName: "First", description: "Do it" }]
    );
    assert.deepEqual(merged, [
      {
        apiName: "A",
        displayName: "First",
        description: "Do it",
        unlockTime: 50,
      },
      { apiName: "B", displayName: null, description: null, unlockTime: null },
    ]);
    assert.equal(firstUnlockTime(entry({ achievements: merged })), 50);
  });

  it("stores Steam's playtime as the part Hydra has not tracked", () => {
    assert.equal(steamPlayTimeToStore(100, 40 * 60_000), 60 * 60_000);
    assert.equal(steamPlayTimeToStore(10, 40 * 60_000), 0);
  });

  it("keeps earlier achievements when only playtime changes", () => {
    const previous = entry({ achievements: [] });
    assert.deepEqual(
      toHistoryEntry({ appid: 1, playtime_forever: 5 }, previous, 1)
        .achievements,
      []
    );
  });
});
