import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-ignore The Node ESM test runner requires the source extension.
import * as sections from "./home-sections.ts";
// @ts-ignore The Node ESM test runner requires the source extension.
import type { HomeGame } from "./home-sections.ts";

const {
  BACKLOG_IDLE_MS,
  getAlmostDone,
  getBacklog,
  getCompletionProgress,
  getNewDownloads,
  getRecentlyAdded,
  getWishlist,
  getContinuePlaying,
  getOwnedKeys,
} = sections;

const HOUR = 3_600_000;
const now = new Date("2026-10-21T12:00:00Z").getTime();
const daysAgo = (days: number) => new Date(now - days * 24 * HOUR);

const game = (
  objectId: string,
  overrides: Partial<HomeGame> = {}
): HomeGame => ({
  shop: "steam",
  objectId,
  title: objectId,
  lastTimePlayed: null,
  playTimeInMilliseconds: 0,
  ...overrides,
});

const ids = (list: HomeGame[]) => list.map((item) => item.objectId);

describe("getContinuePlaying", () => {
  it("lists played games newest first, without finished or dropped ones", () => {
    const list = [
      game("old", { lastTimePlayed: daysAgo(10) }),
      game("new", { lastTimePlayed: daysAgo(1) }),
      game("done", { lastTimePlayed: daysAgo(0), playStatus: "finished" }),
      game("never"),
    ];
    assert.deepEqual(ids(getContinuePlaying(list)), ["new", "old"]);
  });
});

describe("getBacklog", () => {
  const installed = (item: HomeGame) => item.objectId !== "missing";

  it("takes installed games marked backlog, never played or long untouched", () => {
    const list = [
      game("recent", {
        lastTimePlayed: daysAgo(3),
        playTimeInMilliseconds: HOUR,
      }),
      game("stale", {
        lastTimePlayed: new Date(now - BACKLOG_IDLE_MS - HOUR),
        playTimeInMilliseconds: HOUR,
      }),
      game("never-long", { metadata: { howLongToBeat: { mainStory: 40 } } }),
      game("never-short", { metadata: { howLongToBeat: { mainStory: 5 } } }),
      game("marked", { playStatus: "backlog", lastTimePlayed: daysAgo(1) }),
      game("missing"),
      game("finished", { playStatus: "finished" }),
      game("playing", { playStatus: "playing" }),
      game("shown"),
    ];
    assert.deepEqual(
      ids(getBacklog(list, installed, new Set(["steam:shown"]), now)),
      ["marked", "never-short", "never-long", "stale"]
    );
  });
});

describe("getOwnedKeys", () => {
  it("knows each copy of a game and the catalogue game it is linked to", () => {
    const owned = getOwnedKeys([
      game("owned"),
      game("epic-copy", {
        shop: "epic",
        catalogueGame: { shop: "steam", objectId: "owned-on-epic" },
      }),
    ]);

    assert.equal(owned.has("steam:owned"), true);
    assert.equal(owned.has("epic:epic-copy"), true);
    assert.equal(owned.has("steam:owned-on-epic"), true);
    assert.equal(owned.has("steam:other"), false);
  });
});

describe("getNewDownloads", () => {
  it("lists games not installed with new download options, wishlisted first", () => {
    const installed = new Set(["b"]);
    const list = [
      game("a", { newDownloadOptionsCount: 5 }),
      game("b", { newDownloadOptionsCount: 1 }),
      game("c"),
      game("d", {
        members: [
          game("d1", { newDownloadOptionsCount: 2, wishlisted: true }),
          game("d2", { newDownloadOptionsCount: 4 }),
        ],
      }),
    ];
    assert.deepEqual(
      ids(getNewDownloads(list, (item) => installed.has(item.objectId))),
      ["d", "a"]
    );
  });
});

describe("getWishlist", () => {
  it("lists wishlisted games not installed, new downloads first", () => {
    const list = [
      game("old", { wishlisted: true, addedToLibraryAt: daysAgo(10) }),
      game("new", { wishlisted: true, addedToLibraryAt: daysAgo(1) }),
      game("found", { wishlisted: true, newDownloadOptionsCount: 1 }),
      game("installed", { wishlisted: true }),
      game("plain"),
    ];
    assert.deepEqual(
      ids(getWishlist(list, (item) => item.objectId === "installed")),
      ["found", "new", "old"]
    );
  });
});

describe("getRecentlyAdded", () => {
  it("lists games added in the last 30 days that were never played", () => {
    const list = [
      game("old", { addedToLibraryAt: daysAgo(40) }),
      game("played", {
        addedToLibraryAt: daysAgo(2),
        lastTimePlayed: daysAgo(1),
      }),
      game("older", { addedToLibraryAt: daysAgo(10) }),
      game("newest", { addedToLibraryAt: daysAgo(1) }),
      game("unknown"),
    ];
    assert.deepEqual(ids(getRecentlyAdded(list, new Set(), now)), [
      "newest",
      "older",
    ]);
  });
});

describe("getAlmostDone", () => {
  it("measures progress by achievements or main story time", () => {
    assert.equal(
      getCompletionProgress(
        game("a", { achievementCount: 10, unlockedAchievementCount: 9 })
      ),
      0.9
    );
    assert.equal(
      getCompletionProgress(
        game("b", {
          playTimeInMilliseconds: 8 * HOUR,
          metadata: { howLongToBeat: { mainStory: 10 } },
        })
      ),
      0.8
    );
    assert.equal(
      getCompletionProgress(
        game("c", { achievementCount: 5, unlockedAchievementCount: 5 })
      ),
      null
    );
    assert.equal(getCompletionProgress(game("d")), null);
  });

  it("lists played games past 80 %, closest first, without finished ones", () => {
    const list = [
      game("close", {
        playTimeInMilliseconds: HOUR,
        achievementCount: 10,
        unlockedAchievementCount: 9,
      }),
      game("closer", {
        playTimeInMilliseconds: 19 * HOUR,
        metadata: { howLongToBeat: { mainStory: 20 } },
      }),
      game("far", {
        playTimeInMilliseconds: HOUR,
        achievementCount: 10,
        unlockedAchievementCount: 3,
      }),
      game("finished", {
        playStatus: "finished",
        playTimeInMilliseconds: HOUR,
        achievementCount: 10,
        unlockedAchievementCount: 9,
      }),
      game("excluded", {
        playTimeInMilliseconds: HOUR,
        achievementCount: 10,
        unlockedAchievementCount: 9,
      }),
    ];
    assert.deepEqual(ids(getAlmostDone(list, new Set(["steam:excluded"]))), [
      "closer",
      "close",
    ]);
  });
});
