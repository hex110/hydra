import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Game } from "@types";

import { selectGamesForBackup } from "./manual-backup-scope.ts";

const NOW = Date.parse("2026-10-28T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW - days * 24 * 60 * 60_000);

const game = (
  objectId: string,
  overrides: Partial<Game> = {}
): Pick<
  Game,
  | "shop"
  | "objectId"
  | "title"
  | "isDeleted"
  | "lastTimePlayed"
  | "playTimeInMilliseconds"
> => ({
  shop: "steam",
  objectId,
  title: objectId,
  isDeleted: false,
  lastTimePlayed: null,
  playTimeInMilliseconds: 0,
  ...overrides,
});

const games = [
  game("today", { playTimeInMilliseconds: 1, lastTimePlayed: daysAgo(0.5) }),
  game("last-week", {
    playTimeInMilliseconds: 1,
    lastTimePlayed: daysAgo(6),
  }),
  game("old", { playTimeInMilliseconds: 1, lastTimePlayed: daysAgo(90) }),
  // Another device played it; this one never launched it.
  game("elsewhere", { lastTimePlayed: daysAgo(1) }),
  game("never"),
  game("removed", { isDeleted: true, playTimeInMilliseconds: 1 }),
  game("custom", { shop: "custom", playTimeInMilliseconds: 1 }),
];

const ids = (scope: Parameters<typeof selectGamesForBackup>[1]) =>
  selectGamesForBackup(games, scope, NOW).map((entry) => entry.objectId);

describe("selectGamesForBackup", () => {
  it("takes every game this device launched", () => {
    assert.deepEqual(ids({ kind: "launched" }), ["today", "last-week", "old"]);
  });

  it("takes the games launched here within the last N days", () => {
    assert.deepEqual(ids({ kind: "recent", days: 1 }), ["today"]);
    assert.deepEqual(ids({ kind: "recent", days: 7 }), ["today", "last-week"]);
    assert.deepEqual(ids({ kind: "recent", days: 365 }), [
      "today",
      "last-week",
      "old",
    ]);
  });

  it("treats a day count below one as one day", () => {
    assert.deepEqual(ids({ kind: "recent", days: 0 }), ["today"]);
  });

  it("takes the whole library, minus removed and custom games", () => {
    assert.deepEqual(ids({ kind: "all" }), [
      "today",
      "last-week",
      "old",
      "elsewhere",
      "never",
    ]);
  });
});
