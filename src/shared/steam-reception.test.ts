import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-ignore The Node ESM test runner requires the source extension.
import * as reception from "./steam-reception.ts";

const { parseSteamCurrentPlayers, parseSteamMetacritic, parseSteamReviews } =
  reception;

describe("Steam reception", () => {
  const storeItem = (summary: unknown) => ({
    response: { store_items: [{ reviews: { summary_filtered: summary } }] },
  });

  it("summarises reviews from the store browse service", () => {
    assert.deepEqual(
      parseSteamReviews(
        storeItem({
          review_count: 392456,
          percent_positive: 98,
          review_score_label: "Overwhelmingly Positive",
        })
      ),
      {
        label: "Overwhelmingly Positive",
        percentPositive: 98,
        totalReviews: 392456,
      }
    );
  });

  it("has no review summary for unreviewed or malformed responses", () => {
    assert.equal(parseSteamReviews(storeItem({ review_count: 0 })), null);
    assert.equal(parseSteamReviews({ response: { store_items: [] } }), null);
    assert.equal(parseSteamReviews({}), null);
    assert.equal(parseSteamReviews(null), null);
  });

  it("keeps the percentage within 0-100", () => {
    assert.equal(
      parseSteamReviews(storeItem({ review_count: 10, percent_positive: 140 }))
        ?.percentPositive,
      100
    );
  });

  it("reads the current player count only from a successful response", () => {
    assert.equal(
      parseSteamCurrentPlayers({ response: { player_count: 4210, result: 1 } }),
      4210
    );
    assert.equal(parseSteamCurrentPlayers({ response: { result: 42 } }), null);
    assert.equal(parseSteamCurrentPlayers(undefined), null);
  });

  it("reads the Metacritic score and only keeps https links", () => {
    assert.deepEqual(
      parseSteamMetacritic(
        {
          "620": {
            success: true,
            data: {
              metacritic: { score: 95, url: "https://mc.example/portal-2" },
            },
          },
        },
        "620"
      ),
      { score: 95, url: "https://mc.example/portal-2" }
    );
    assert.equal(
      parseSteamMetacritic(
        { "620": { data: { metacritic: { score: 95, url: "javascript:x" } } } },
        "620"
      )?.url,
      null
    );
    assert.equal(
      parseSteamMetacritic({ "620": { success: true, data: {} } }, "620"),
      null
    );
  });
});
