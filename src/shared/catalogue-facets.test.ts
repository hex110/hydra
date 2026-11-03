import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-ignore The Node ESM test runner requires the source extension.
import * as facets from "./catalogue-facets.ts";

const { orderFacetItems, NON_GAME_STEAM_GENRES } = facets;

const items = [
  { value: 1, label: "Action" },
  { value: 2, label: "Indie" },
  { value: 3, label: "Roguelike" },
  { value: 4, label: "Empty" },
  { value: 5, label: "Unknown" },
];
const counts = new Map<string | number, number>([
  [1, 900],
  [2, 5000],
  [3, 40],
  [4, 0],
]);

const values = (list: { value: string | number }[]) =>
  list.map((item) => item.value);

describe("orderFacetItems", () => {
  it("orders by count, highest first, with uncounted values last", () => {
    assert.deepEqual(
      values(orderFacetItems(items, counts, new Set())),
      [2, 1, 3, 5]
    );
  });

  it("hides values with no games unless they are selected", () => {
    assert.ok(!values(orderFacetItems(items, counts, new Set())).includes(4));
    assert.ok(values(orderFacetItems(items, counts, new Set([4]))).includes(4));
  });

  it("puts selected values first, then the library's, in the library's order", () => {
    const ordered = orderFacetItems(items, counts, new Set([3]), [1, 2]);
    assert.deepEqual(values(ordered), [3, 1, 2, 5]);
    assert.deepEqual(
      ordered.map((item: { group: string }) => item.group),
      ["selected", "library", "library", "rest"]
    );
  });

  it("keeps the given order before any count is known", () => {
    assert.deepEqual(
      values(orderFacetItems(items, null, new Set())),
      [1, 2, 3, 4, 5]
    );
  });
});

describe("NON_GAME_STEAM_GENRES", () => {
  it("names software, not games", () => {
    assert.ok(NON_GAME_STEAM_GENRES.has("Utilities"));
    assert.ok(!NON_GAME_STEAM_GENRES.has("Action"));
  });
});
