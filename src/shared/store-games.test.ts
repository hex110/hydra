import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-ignore The Node ESM test runner requires the source extension.
import * as storeGames from "./store-games.ts";

const { isSingleplayerGame, isFinishedGame, parseStoreItem } = storeGames;

const tags = (...ids: number[]) =>
  ids.map((tagid, index) => ({ tagid, weight: 1000 - index }));

const item = (over: Record<string, unknown> = {}) => ({
  type: 0,
  playerCategories: [2],
  tags: tags(4182),
  ...over,
});

describe("isSingleplayerGame", () => {
  it("accepts a game led by Singleplayer", () => {
    assert.equal(isSingleplayerGame(item()), true);
  });

  it("accepts Singleplayer listed above Co-op (Baldur's Gate 3)", () => {
    assert.equal(isSingleplayerGame(item({ tags: tags(4182, 1685) })), true);
  });

  it("rejects Singleplayer listed below a multiplayer tag (Helldivers 2)", () => {
    assert.equal(
      isSingleplayerGame(item({ tags: tags(1685, 3859, 4182) })),
      false
    );
  });

  it("rejects a game without the Singleplayer tag", () => {
    assert.equal(isSingleplayerGame(item({ tags: tags(122) })), false);
  });

  it("rejects an MMO and anything that is not a game", () => {
    assert.equal(
      isSingleplayerGame(item({ playerCategories: [2, 20] })),
      false
    );
    assert.equal(isSingleplayerGame(item({ type: 4 })), false);
  });

  it("rejects a game Steam lists without single-player", () => {
    assert.equal(isSingleplayerGame(item({ playerCategories: [1] })), false);
  });
});

describe("isFinishedGame", () => {
  const now = Date.UTC(2026, 10, 3);
  const year = 365 * 24 * 60 * 60 * 1000;

  it("is unknown without a build date", () => {
    assert.equal(
      isFinishedGame(
        { releaseDate: now - 3 * year, isEarlyAccess: false },
        null,
        now
      ),
      null
    );
  });

  it("is finished when released and last built long ago", () => {
    assert.equal(
      isFinishedGame(
        { releaseDate: now - 3 * year, isEarlyAccess: false },
        now - 2 * year,
        now
      ),
      true
    );
  });

  it("is not finished with a recent build, a recent release or Early Access", () => {
    const old = { releaseDate: now - 3 * year, isEarlyAccess: false };
    assert.equal(isFinishedGame(old, now - year / 4, now), false);
    assert.equal(
      isFinishedGame(
        { ...old, releaseDate: now - year / 2 },
        now - 2 * year,
        now
      ),
      false
    );
    assert.equal(
      isFinishedGame({ ...old, isEarlyAccess: true }, now - 2 * year, now),
      false
    );
  });
});

describe("parseStoreItem", () => {
  const raw = {
    success: 1,
    type: 0,
    appid: 1245620,
    name: "ELDEN RING",
    tags: [
      { tagid: 1695, weight: 791 },
      { tagid: 29482, weight: 1079 },
    ],
    categories: { supported_player_categoryids: [2, 1] },
    reviews: {
      summary_filtered: {
        review_count: 835064,
        percent_positive: 93,
        review_score_label: "Very Positive",
      },
    },
    basic_info: {
      developers: [{ name: "FromSoftware, Inc." }],
      publishers: [{ name: "Bandai Namco Entertainment" }],
    },
    assets: {
      asset_url_format: "steam/apps/1245620/${FILENAME}?t=1",
      header: "header.jpg",
    },
    release: { steam_release_date: 1645744078 },
  };

  it("reads the fields Hydra keeps, tags most voted first", () => {
    const parsed = parseStoreItem(raw);
    assert.equal(parsed?.appId, "1245620");
    assert.deepEqual(
      parsed?.tags.map((tag: { tagid: number }) => tag.tagid),
      [29482, 1695]
    );
    assert.equal(parsed?.reviewPercent, 93);
    assert.equal(parsed?.reviewLabel, "Very Positive");
    assert.equal(parsed?.releaseDate, 1645744078000);
    assert.equal(parsed?.developers[0], "FromSoftware, Inc.");
    assert.equal(
      parsed?.headerImageUrl,
      "https://shared.steamstatic.com/store_item_assets/steam/apps/1245620/header.jpg?t=1"
    );
  });

  it("has no review score without reviews, and sees Early Access among the first tags", () => {
    const parsed = parseStoreItem({
      ...raw,
      reviews: undefined,
      tags: [{ tagid: 493, weight: 10 }],
    });
    assert.equal(parsed?.reviewPercent, null);
    assert.equal(parsed?.isEarlyAccess, true);
  });

  it("returns null for a game Steam does not list", () => {
    assert.equal(parseStoreItem({ appid: 1, success: 15 }), null);
  });
});
