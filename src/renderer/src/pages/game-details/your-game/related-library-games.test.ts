import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-ignore The Node ESM test runner requires the source extension.
import * as related from "./related-library-games.ts";

const { findRelatedLibraryGames, normalizeGameTitle } = related;

const game = (id: string, title: string) => ({ id, title });

describe("related library games", () => {
  it("normalises punctuation and case", () => {
    assert.equal(
      normalizeGameTitle("DARK SOULS™: Remastered"),
      "dark souls remastered"
    );
  });

  it("finds sequels, editions and the base game", () => {
    const library = [
      game("1", "Dark Souls III"),
      game("2", "Dark Souls: Remastered"),
      game("3", "Darkest Dungeon"),
      game("4", "Dark Souls"),
      game("5", "Portal 2"),
    ];

    assert.deepEqual(
      findRelatedLibraryGames("Dark Souls", library, new Set(["4"])).map(
        (item) => item.id
      ),
      ["1", "2"]
    );
    assert.deepEqual(
      findRelatedLibraryGames("Dark Souls III", library, new Set(["1"])).map(
        (item) => item.id
      ),
      ["4"]
    );
  });

  it("ignores very short base titles", () => {
    assert.deepEqual(
      findRelatedLibraryGames("It", [game("1", "It Takes Two")], new Set()),
      []
    );
  });
});
