import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SteamSimilarGame } from "@shared";
import {
  fetchSimilarGames,
  getSimilarGamesSectionState,
  normalizeSimilarGamesResponse,
  SIMILAR_GAMES_LIMIT,
  type SimilarGame,
  type SimilarGamesGet,
} from "./similar-games.js";

describe("getSimilarGamesSectionState", () => {
  it("uses the same hidden, loading, ready, and empty states on both surfaces", () => {
    assert.equal(getSimilarGamesSectionState(false, false, 0), "hidden");
    assert.equal(getSimilarGamesSectionState(true, true, 0), "loading");
    assert.equal(getSimilarGamesSectionState(true, false, 1), "ready");
    assert.equal(getSimilarGamesSectionState(true, false, 0), "empty");
  });
});

const game = (
  objectId: string,
  overrides: Partial<SimilarGame> = {}
): SimilarGame => ({
  objectId,
  shop: "steam",
  title: `Game ${objectId}`,
  iconUrl: null,
  libraryHeroImageUrl: null,
  libraryImageUrl: `https://example.com/${objectId}.jpg`,
  coverImageUrl: null,
  logoImageUrl: null,
  downloadSources: [],
  ...overrides,
});

const steamGame = (objectId: string): SteamSimilarGame => ({
  ...game(objectId),
  shop: "steam",
});

describe("normalizeSimilarGamesResponse", () => {
  const query = { objectId: "current", shop: "steam" as const };

  it("preserves server order while excluding invalid identities and duplicates", () => {
    const results = normalizeSimilarGamesResponse(
      [
        game("first"),
        game("current"),
        game("other-shop", { shop: "launchbox" }),
        game("first"),
        game("second"),
      ],
      query
    );

    assert.deepEqual(
      results.map(({ objectId }) => objectId),
      ["first", "second"]
    );
  });

  it("rejects blank identities, trims valid identities, and preserves the limit", () => {
    const results = normalizeSimilarGamesResponse(
      [
        game(" \t "),
        game("blank-title", { title: " \t " }),
        game(" padded-id ", { title: " Padded title " }),
        ...Array.from({ length: SIMILAR_GAMES_LIMIT }, (_, index) =>
          game(`valid-${index}`)
        ),
      ],
      query
    );

    assert.equal(results.length, SIMILAR_GAMES_LIMIT);
    assert.equal(results[0].objectId, "padded-id");
    assert.equal(results[0].title, "Padded title");
  });

  it("drops malformed download sources and limits the results", () => {
    const response = Array.from(
      { length: SIMILAR_GAMES_LIMIT + 3 },
      (_, index) => ({
        ...game(String(index)),
        downloadSources: [
          `Source ${index}`,
          { id: `source-${index}` },
          { name: "Legacy" },
          "",
        ],
      })
    );

    const results = normalizeSimilarGamesResponse(response, query);

    assert.equal(results.length, SIMILAR_GAMES_LIMIT);
    assert.deepEqual(results[0].downloadSources, ["Source 0"]);
  });

  it("keeps API-resolved profile cover artwork", () => {
    const [result] = normalizeSimilarGamesResponse(
      [
        game("profile-cover", {
          coverImageUrl: "https://example.com/profile-cover.jpg",
        }),
      ],
      query
    );

    assert.equal(result.coverImageUrl, "https://example.com/profile-cover.jpg");
  });

  it("skips malformed games without rejecting usable results", () => {
    const results = normalizeSimilarGamesResponse(
      [
        null,
        { objectId: "broken", shop: "steam" },
        {
          ...game("missing-sources"),
          downloadSources: undefined,
        },
        game("valid"),
      ],
      query
    );

    assert.deepEqual(
      results.map(({ objectId }) => objectId),
      ["missing-sources", "valid"]
    );
    assert.deepEqual(results[0].downloadSources, []);
  });

  it("rejects malformed top-level endpoint responses", () => {
    assert.throws(() => normalizeSimilarGamesResponse({}, query), TypeError);
  });
});

describe("fetchSimilarGames", () => {
  it("calls the similar endpoint with the shared limit", async () => {
    const calls: {
      path: string;
      options: Parameters<SimilarGamesGet>[1];
    }[] = [];
    const get: SimilarGamesGet = async (path, options) => {
      calls.push({ path, options });
      return [game("result")];
    };

    const results = await fetchSimilarGames(
      { objectId: "game/id", shop: "steam" },
      get,
      ["source-b", "source-a"]
    );

    assert.equal(results.length, 1);
    assert.deepEqual(calls, [
      {
        path: "/catalogue/steam/game%2Fid/similar",
        options: {
          params: {
            take: SIMILAR_GAMES_LIMIT,
            downloadSourceIds: ["source-b", "source-a"],
          },
          needsAuth: false,
        },
      },
    ]);
  });

  it("uses Steam's list for Steam games without asking the Hydra API", async () => {
    let hydraCalls = 0;
    const get: SimilarGamesGet = async () => {
      hydraCalls += 1;
      return [game("hydra")];
    };

    const results = await fetchSimilarGames(
      { objectId: "current", shop: "steam" },
      get,
      [],
      async () => [
        steamGame("steam-a"),
        steamGame("current"),
        steamGame("steam-b"),
      ]
    );

    assert.deepEqual(
      results.map(({ objectId }) => objectId),
      ["steam-a", "steam-b"]
    );
    assert.equal(hydraCalls, 0);
  });

  it("falls back to the Hydra API when Steam has no list or fails", async () => {
    const get: SimilarGamesGet = async () => [game("hydra")];
    const query = { objectId: "current", shop: "steam" as const };

    for (const steam of [
      async () => null,
      async () => [],
      async () => {
        throw new Error("offline");
      },
    ]) {
      const results = await fetchSimilarGames(query, get, [], steam);

      assert.deepEqual(
        results.map(({ objectId }) => objectId),
        ["hydra"]
      );
    }
  });

  it("only asks Steam about Steam games", async () => {
    let steamCalls = 0;
    const results = await fetchSimilarGames(
      { objectId: "mario", shop: "launchbox" },
      async () => [game("hydra", { shop: "launchbox" })],
      [],
      async () => {
        steamCalls += 1;
        return [steamGame("steam")];
      }
    );

    assert.deepEqual(
      results.map(({ objectId }) => objectId),
      ["hydra"]
    );
    assert.equal(steamCalls, 0);
  });

  it("does not request unsupported custom games", async () => {
    let calls = 0;
    const get: SimilarGamesGet = async () => {
      calls += 1;
      return [];
    };

    const results = await fetchSimilarGames(
      { objectId: "custom", shop: "custom" },
      get
    );

    assert.deepEqual(results, []);
    assert.equal(calls, 0);
  });
});
