import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-ignore The Node ESM test runner requires the source extension.
import * as sections from "./home-sections.ts";
// @ts-ignore The Node ESM test runner requires the source extension.
import type { HomeGame } from "./home-sections.ts";

const {
  BACKLOG_IDLE_MS,
  getBacklog,
  getContinuePlaying,
  getOwnedKeys,
  getSuggestionSeeds,
  rankSuggestions,
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

describe("getSuggestionSeeds", () => {
  it("weights recent play and finished games, and skips dropped ones", () => {
    const list = [
      game("lots-of-old-play", { playTimeInMilliseconds: 20 * HOUR }),
      game("recent", { playTimeInMilliseconds: 2 * HOUR }),
      game("finished", {
        playStatus: "finished",
        playTimeInMilliseconds: HOUR,
      }),
      game("dropped", {
        playStatus: "dropped",
        playTimeInMilliseconds: 99 * HOUR,
      }),
      game("unplayed"),
      game("classic", { shop: "launchbox", playTimeInMilliseconds: 50 * HOUR }),
    ];
    const recent = new Map([["steam:recent", 8 * HOUR]]);
    assert.deepEqual(ids(getSuggestionSeeds(list, recent)), [
      "recent",
      "lots-of-old-play",
      "finished",
    ]);
  });
});

describe("rankSuggestions", () => {
  const similar = (objectId: string) => ({
    shop: "steam",
    objectId,
    title: objectId,
  });

  it("prefers games shared by several seeds and leaves owned ones out", () => {
    const owned = getOwnedKeys([
      game("owned"),
      game("epic-copy", {
        shop: "epic",
        catalogueGame: { shop: "steam", objectId: "owned-on-epic" },
      }),
    ]);
    const ranked = rankSuggestions(
      [
        {
          seedTitle: "Hades",
          games: [similar("a"), similar("owned"), similar("b")],
        },
        {
          seedTitle: "Celeste",
          games: [similar("b"), similar("owned-on-epic"), similar("c")],
        },
      ],
      owned
    );
    assert.deepEqual(
      ranked.map((item) => [item.game.objectId, item.becauseOf]),
      [
        ["b", "Hades"],
        ["a", "Hades"],
        ["c", "Celeste"],
      ]
    );
  });

  it("spreads the list over the games it comes from", () => {
    const many = (prefix: string) =>
      Array.from({ length: 6 }, (_, index) => similar(`${prefix}${index}`));
    const ranked = rankSuggestions(
      [
        { seedTitle: "Big", games: many("big") },
        { seedTitle: "Small", games: many("small") },
      ],
      new Set(),
      6
    );
    const bySeed = ranked.reduce<Record<string, number>>((counts, item) => {
      counts[item.becauseOf] = (counts[item.becauseOf] ?? 0) + 1;
      return counts;
    }, {});
    assert.deepEqual(bySeed, { Big: 3, Small: 3 });
  });
});
