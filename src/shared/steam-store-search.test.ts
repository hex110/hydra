import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-ignore The Node ESM test runner requires the source extension.
import * as search from "./steam-store-search.ts";

const { buildSteamSearchParams, parseSteamSearchResponse } = search;

describe("parseSteamSearchResponse", () => {
  it("reads app ids in order and skips bundles", () => {
    const html = [
      '<a data-ds-appid="1794680" href="x">',
      '<a data-ds-bundleid="1" data-ds-appid="10,20" href="y">',
      '<a data-ds-appid="1145360" href="z">',
    ].join("");
    assert.deepEqual(
      parseSteamSearchResponse({ results_html: html, total_count: 2029 }),
      { total: 2029, appIds: ["1794680", "1145360"] }
    );
  });

  it("is null for an answer that is not a search page", () => {
    assert.equal(parseSteamSearchResponse({ success: 2 }), null);
    assert.equal(parseSteamSearchResponse(null), null);
  });
});

describe("buildSteamSearchParams", () => {
  it("joins tags and excluded tags and caps the page", () => {
    const params = buildSteamSearchParams({
      tags: [1716],
      untags: [3959, 42804],
      sortBy: "Reviews_DESC",
      count: 500,
    });
    assert.equal(params.tags, "1716");
    assert.equal(params.untags, "3959,42804");
    assert.equal(params.sort_by, "Reviews_DESC");
    assert.equal(params.count, "100");
    assert.equal(params.category1, "998");
  });
});
