import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-ignore The Node ESM test runner requires the source extension.
import * as backend from "./catalogue-browse-backend.ts";
import type { CatalogueSearchPayload } from "@types";

const {
  chooseBrowseBackend,
  toSteamSearchQuery,
  toHydraSearchPayload,
  passesBrowseExtras,
} = backend;

const filters = (
  over: Partial<CatalogueSearchPayload> = {}
): CatalogueSearchPayload => ({
  title: "",
  sortBy: "popularity",
  sortOrder: "desc",
  downloadSourceFingerprints: [],
  tags: [],
  publishers: [],
  genres: [],
  developers: [],
  protondbSupportBadges: [],
  deckCompatibility: [],
  ...over,
});

describe("chooseBrowseBackend", () => {
  it("uses Hydra's search for ordinary requests", () => {
    assert.equal(chooseBrowseBackend(filters({ tags: [1716] }), []), "hydra");
  });

  it("uses Steam's search to exclude tags or sort by reviews", () => {
    assert.equal(
      chooseBrowseBackend(filters({ excludeTags: [3959] }), []),
      "steam"
    );
    assert.equal(
      chooseBrowseBackend(filters({ sortBy: "bestRated" }), []),
      "steam"
    );
  });

  it("applies the avoid list only when asked", () => {
    assert.equal(chooseBrowseBackend(filters(), [615955]), "hydra");
    assert.equal(
      chooseBrowseBackend(filters({ useAvoidList: true }), [615955]),
      "steam"
    );
  });

  it("filters Hydra's pages when a source filter is set too", () => {
    assert.equal(
      chooseBrowseBackend(
        filters({ excludeTags: [3959], downloadSourceFingerprints: ["x"] }),
        []
      ),
      "hydra-filtered"
    );
  });
});

describe("browse requests", () => {
  it("builds Steam's query with exclusions and players", () => {
    const query = toSteamSearchQuery(
      filters({
        tags: [1716],
        excludeTags: [3959],
        useAvoidList: true,
        players: ["coop"],
        sortBy: "bestRated",
      }),
      [615955]
    );
    assert.deepEqual(query.untags, [3959, 615955]);
    assert.deepEqual(query.categories, [9]);
    assert.equal(query.sortBy, "Reviews_DESC");
  });

  it("strips Browse-only fields for Hydra and swaps Best rated", () => {
    const payload = toHydraSearchPayload(
      filters({ excludeTags: [1], players: ["pvp"], sortBy: "bestRated" })
    );
    assert.equal("excludeTags" in payload, false);
    assert.equal("players" in payload, false);
    assert.equal(payload.sortBy, "reviewScore");
  });

  it("drops a loaded game with an excluded tag or missing players", () => {
    const request = filters({ excludeTags: [3959], players: ["coop"] });
    assert.equal(
      passesBrowseExtras({ tags: [1716, 3959], players: [9] }, request, []),
      false
    );
    assert.equal(
      passesBrowseExtras({ tags: [1716], players: [2] }, request, []),
      false
    );
    assert.equal(
      passesBrowseExtras({ tags: [1716], players: [2, 9] }, request, []),
      true
    );
  });
});
