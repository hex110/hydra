import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
// @ts-ignore The Node ESM test runner requires the source extension.
import * as resultsCache from "./catalogue-results-cache.ts";

const { appendCatalogueResults, catalogueResultsCache, getCatalogueQueryKey } =
  resultsCache;

describe("catalogue results cache", () => {
  beforeEach(() => catalogueResultsCache.clear());

  it("gives the same key regardless of source order", () => {
    assert.equal(
      getCatalogueQueryKey({ title: "" }, "modern", ["b", "a"]),
      getCatalogueQueryKey({ title: "" }, "modern", ["a", "b"])
    );
    assert.notEqual(
      getCatalogueQueryKey({ title: "" }, "modern", []),
      getCatalogueQueryKey({ title: "" }, "classics", [])
    );
  });

  it("appends a page without repeating games", () => {
    assert.deepEqual(
      appendCatalogueResults(
        [{ id: "1" }, { id: "2" }],
        [{ id: "2" }, { id: "3" }]
      ).map((game) => game.id),
      ["1", "2", "3"]
    );
  });

  it("returns the snapshot only for the same search", () => {
    catalogueResultsCache.set({
      key: "a",
      results: [{ id: "1" }],
      itemsCount: 10,
      pagesLoaded: 1,
      scrollTop: 0,
    });
    catalogueResultsCache.setScrollTop("a", 420);
    catalogueResultsCache.setScrollTop("b", 99);

    assert.equal(catalogueResultsCache.get("b"), null);
    assert.equal(catalogueResultsCache.get("a")?.scrollTop, 420);
  });
});
