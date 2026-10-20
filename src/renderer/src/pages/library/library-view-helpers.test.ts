import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-ignore The Node ESM test runner requires the source extension.
import { groupLibrary } from "./library-grouping.ts";
// @ts-ignore The Node ESM test runner requires the source extension.
import * as selection from "./library-selection.ts";
// @ts-ignore The Node ESM test runner requires the source extension.
import * as cardSize from "./library-card-size.ts";
// @ts-ignore The Node ESM test runner requires the source extension.
import { findTypeAheadMatch, moveFocus } from "./library-keyboard.ts";

interface Game {
  shop: string;
  objectId: string;
  installed?: boolean;
  playStatus?: "playing" | "backlog" | "finished" | "dropped" | null;
  customGenres?: string[];
  hasActiveSteamImport?: boolean;
}

const ids = (list: { objectId: string }[]) => list.map((g) => g.objectId);

describe("groupLibrary", () => {
  const games: Game[] = [
    { shop: "custom", objectId: "a", playStatus: "finished", installed: true },
    { shop: "steam", objectId: "b", hasActiveSteamImport: true },
    { shop: "custom", objectId: "c", playStatus: "playing", installed: true },
    { shop: "launchbox", objectId: "d" },
  ];
  const installed = (game: Game) => Boolean(game.installed);

  it("groups by play status in the status order", () => {
    const groups = groupLibrary(games, "play_status", installed);
    assert.deepEqual(
      groups.map((group) => [group.value, ids(group.games)]),
      [
        ["playing", ["c"]],
        ["finished", ["a"]],
        ["none", ["b", "d"]],
      ]
    );
  });

  it("puts a game in every genre it has, games without one last", () => {
    const groups = groupLibrary(
      [
        { shop: "custom", objectId: "x", customGenres: ["RPG", "Action"] },
        { shop: "custom", objectId: "y" },
        { shop: "custom", objectId: "z", customGenres: ["RPG"] },
      ],
      "genre",
      installed
    );
    assert.deepEqual(
      groups.map((group) => [group.value, ids(group.games)]),
      [
        ["Action", ["x"]],
        ["RPG", ["x", "z"]],
        ["", ["y"]],
      ]
    );
  });

  it("groups by source and by installed", () => {
    assert.deepEqual(
      groupLibrary(games, "source", installed).map((group) => group.value),
      ["local", "steam", "classics"]
    );
    assert.deepEqual(
      groupLibrary(games, "installed", installed).map((group) => [
        group.value,
        ids(group.games),
      ]),
      [
        ["installed", ["a", "c"]],
        ["not_installed", ["b", "d"]],
      ]
    );
  });
});

describe("library selection", () => {
  const order = ["a", "b", "c", "d", "e"];

  it("toggles and extends a range from the anchor", () => {
    let state = selection.selectOnly("b");
    state = selection.selectRange(state, order, "d", false);
    assert.deepEqual([...state.keys], ["b", "c", "d"]);
    state = selection.toggleSelection(state, "c");
    assert.deepEqual([...state.keys], ["b", "d"]);
    state = selection.selectRange(state, order, "a", true);
    assert.deepEqual([...state.keys].sort(), ["a", "b", "c", "d"]);
  });

  it("drops cards that are no longer shown", () => {
    const state = selection.pruneSelection(
      { keys: new Set(["a", "z"]), anchor: "z" },
      new Set(order)
    );
    assert.deepEqual([...state.keys], ["a"]);
    assert.equal(state.anchor, null);
  });
});

describe("card size", () => {
  it("maps the old view modes onto the slider", () => {
    const storage = (values: Record<string, string>) => ({
      getItem: (key: string) => values[key] ?? null,
    });
    assert.equal(
      cardSize.readStoredCardSize(storage({ "library-view-mode": "large" })),
      cardSize.LIBRARY_LARGE_CARD_STEP
    );
    assert.equal(
      cardSize.readStoredCardSize(storage({ "library-card-size": "99" })),
      cardSize.LIBRARY_CARD_SIZE_STEPS - 1
    );
    assert.equal(
      cardSize.readStoredCardSize(storage({})),
      cardSize.DEFAULT_LIBRARY_CARD_SIZE
    );
  });

  it("fits as many covers as the width allows", () => {
    assert.equal(cardSize.getLibraryColumns(1000, 0, 16), 9);
    assert.equal(cardSize.getLibraryColumns(1000, 5, 16), 3);
    assert.equal(cardSize.getLibraryColumns(100, 5, 16), 1);
    assert.equal(
      cardSize.getLibraryColumns(1000, cardSize.LIBRARY_LARGE_CARD_STEP, 16),
      2
    );
  });
});

describe("keyboard", () => {
  it("jumps to the next title starting with what was typed", () => {
    const titles = ["Alan Wake", "Bastion", "Baldur's Gate", "Élite"];
    assert.equal(findTypeAheadMatch(titles, "ba", 0), 1);
    assert.equal(findTypeAheadMatch(titles, "b", 2), 2);
    assert.equal(findTypeAheadMatch(titles, "b", 3), 1);
    assert.equal(findTypeAheadMatch(titles, "eli", 0), 3);
    assert.equal(findTypeAheadMatch(titles, "zz", 0), -1);
  });

  it("moves through the grid and stops at its edges", () => {
    assert.equal(moveFocus(5, "ArrowDown", 4, 10), 9);
    assert.equal(moveFocus(9, "ArrowDown", 4, 10), 9);
    assert.equal(moveFocus(1, "ArrowUp", 4, 10), 0);
    assert.equal(moveFocus(-1, "ArrowRight", 4, 10), 0);
    assert.equal(moveFocus(3, "End", 4, 10), 9);
  });
});

describe("library statistics", async () => {
  // @ts-ignore The Node ESM test runner requires the source extension.
  const stats = await import("./library-stats.ts");
  const HOUR = 3_600_000;

  it("counts statuses, completion and playtime per genre", () => {
    const result = stats.getLibraryStats(
      [
        {
          shop: "custom",
          objectId: "a",
          title: "A",
          playStatus: "finished",
          customGenres: ["RPG"],
          playTimeInMilliseconds: 10 * HOUR,
        },
        {
          shop: "custom",
          objectId: "b",
          title: "B",
          customGenres: ["RPG", "Action"],
          playTimeInMilliseconds: 2 * HOUR,
        },
        { shop: "custom", objectId: "c", title: "C", playStatus: "backlog" },
      ],
      (game: { objectId: string }) => game.objectId === "a"
    );
    assert.equal(result.gameCount, 3);
    assert.equal(result.installedCount, 1);
    assert.equal(result.playedCount, 2);
    assert.equal(result.completionRate, 0.5);
    assert.equal(result.statusCounts.backlog, 1);
    assert.equal(result.statusCounts.none, 1);
    assert.deepEqual(result.playTimeByGenre, [
      { genre: "RPG", playTime: 12 * HOUR },
      { genre: "Action", playTime: 2 * HOUR },
    ]);
    assert.deepEqual(
      result.mostPlayed.map((game: { title: string }) => game.title),
      ["A", "B"]
    );
  });

  it("adds recorded play up per month", () => {
    const months = stats.getPlayTimeByMonth(
      [
        { date: "2026-10-02", games: { "steam:1": HOUR, "steam:2": HOUR } },
        { date: "2026-09-30", games: { "steam:1": HOUR } },
        { date: "2025-01-01", games: { "steam:1": HOUR } },
      ],
      new Date(2026, 9, 20),
      3
    );
    assert.deepEqual(months, [
      { month: "2026-08", playTime: 0 },
      { month: "2026-09", playTime: HOUR },
      { month: "2026-10", playTime: 2 * HOUR },
    ]);
  });
});
