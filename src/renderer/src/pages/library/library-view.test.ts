import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-ignore The Node ESM test runner requires the source extension.
import * as view from "./library-view.ts";
// @ts-ignore The Node ESM test runner requires the source extension.
import { EMPTY_LIBRARY_FILTERS } from "./library-filters.ts";

const { applyLibraryView, countLibraryViewFilters, DEFAULT_LIBRARY_VIEW } =
  view;

interface Game {
  shop: string;
  objectId: string;
  installed: boolean;
  hasActiveSteamImport?: boolean;
  platform?: string;
  playStatus?: "backlog";
}

const games: Game[] = [
  { shop: "steam", objectId: "a", hasActiveSteamImport: true, installed: true },
  { shop: "steam", objectId: "b", installed: false, playStatus: "backlog" },
  { shop: "launchbox", objectId: "c", platform: "SNES", installed: true },
  { shop: "launchbox", objectId: "d", platform: "N64", installed: true },
];

const ids = (list: readonly { objectId: string }[]) =>
  list.map((game) => game.objectId);

describe("applyLibraryView", () => {
  const apply = (overrides: Record<string, unknown>) =>
    ids(
      applyLibraryView(
        games,
        { ...DEFAULT_LIBRARY_VIEW, ...overrides },
        (game) => game.installed
      )
    );

  it("narrows by tab, filters, installed and consoles together", () => {
    assert.deepEqual(apply({}), ["a", "b", "c", "d"]);
    assert.deepEqual(apply({ tab: "classics" }), ["c", "d"]);
    assert.deepEqual(apply({ tab: "classics", platforms: ["SNES"] }), ["c"]);
    assert.deepEqual(apply({ installedOnly: true, tab: "steam" }), ["a"]);
    assert.deepEqual(
      apply({
        filters: { ...EMPTY_LIBRARY_FILTERS, playStatuses: ["backlog"] },
      }),
      ["b"]
    );
  });

  it("ignores consoles on tabs without them", () => {
    assert.deepEqual(apply({ tab: "steam", platforms: ["SNES"] }), ["a"]);
  });
});

describe("countLibraryViewFilters", () => {
  it("counts the tab, filters, installed and consoles", () => {
    assert.equal(countLibraryViewFilters(DEFAULT_LIBRARY_VIEW), 0);
    assert.equal(
      countLibraryViewFilters({
        tab: "classics",
        filters: { ...EMPTY_LIBRARY_FILTERS, genres: ["RPG"] },
        installedOnly: true,
        platforms: ["SNES", "N64"],
      }),
      5
    );
  });
});
