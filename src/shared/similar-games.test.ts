import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isSecondaryRelease,
  parseSteamMoreLikeThis,
  rankSimilarGames,
  type SteamTagWeight,
} from "./similar-games.js";

const grid = (id: string, appIds: number[]) =>
  `<div class="recommendation_area_ctn similar_grid_ctn" id="${id}" data-items-to-display="9">` +
  appIds
    .map(
      (appId) =>
        `<div class="similar_grid_item"><a data-panel="{&quot;focusable&quot;:true}" class="similar_grid_capsule"  data-ds-appid="${appId}" data-ds-itemkey="App_${appId}"></a></div>`
    )
    .join("");

describe("parseSteamMoreLikeThis", () => {
  it("reads the main grids in page order and skips demos and coming soon", () => {
    const html = [
      grid("released", [1, 2, 3]),
      grid("comingsoon", [4]),
      grid("demogames3", [5]),
      grid("topselling", [2, 6]),
    ].join("");

    assert.deepEqual(parseSteamMoreLikeThis(html), ["1", "2", "3", "6"]);
  });

  it("returns nothing for a page without grids", () => {
    assert.deepEqual(parseSteamMoreLikeThis("<html></html>"), []);
  });
});

describe("isSecondaryRelease", () => {
  it("flags prologues, demos and test builds but not ordinary titles", () => {
    assert.equal(isSecondaryRelease("Megastore Simulator: Prologue"), true);
    assert.equal(isSecondaryRelease("Hello Neighbor 2 Alpha 1.5"), true);
    assert.equal(isSecondaryRelease("Chants of Sennaar Demo"), true);
    assert.equal(isSecondaryRelease("Demon's Souls"), false);
    assert.equal(isSecondaryRelease("Betaville"), false);
  });
});

const tags = (...entries: [number, number][]): SteamTagWeight[] =>
  entries.map(([tagid, weight]) => ({ tagid, weight }));

describe("rankSimilarGames", () => {
  const source = tags([1, 100], [2, 80], [3, 60]);

  it("puts the closest tag match first", () => {
    const far = { name: "far", tags: tags([9, 100], [8, 80]) };
    const near = { name: "near", tags: tags([1, 100], [2, 80], [3, 60]) };
    const middle = { name: "middle", tags: tags([1, 100], [9, 80]) };

    assert.deepEqual(
      rankSimilarGames(source, [far, middle, near]).map(({ name }) => name),
      ["near", "middle", "far"]
    );
  });

  it("counts a tag few candidates share for more than a common one", () => {
    const common = { name: "common", tags: tags([1, 100], [7, 100]) };
    const rare = { name: "rare", tags: tags([3, 100], [8, 100]) };
    const filler = Array.from({ length: 8 }, (_, n) => ({
      name: `filler${n}`,
      tags: tags([1, 100], [7, 100]),
    }));

    const ranked = rankSimilarGames(tags([1, 100], [3, 100]), [
      common,
      rare,
      ...filler,
    ]);

    assert.equal(ranked[0].name, "rare");
  });

  it("keeps Steam's order between equally matching games", () => {
    const a = { name: "a", tags: tags([1, 100]) };
    const b = { name: "b", tags: tags([1, 100]) };

    assert.deepEqual(
      rankSimilarGames(source, [a, b]).map(({ name }) => name),
      ["a", "b"]
    );
  });

  it("lets a popular game pass the one Steam listed just above it", () => {
    const games = Array.from({ length: 10 }, (_, n) => ({
      name: `game${n}`,
      tags: tags([1, 100]),
      reviewCount: 5,
    }));
    games[1].reviewCount = 90_000;

    assert.equal(rankSimilarGames(source, games)[0].name, "game1");
  });

  it("handles a game without tags and an empty list", () => {
    assert.deepEqual(rankSimilarGames([], [{ tags: [] }]).length, 1);
    assert.deepEqual(rankSimilarGames(source, []), []);
  });
});
