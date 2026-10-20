import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-ignore The Node ESM test runner requires the source extension.
import * as shelves from "./home-shelves.ts";

const { HOME_SHELVES, moveHomeShelf, parseHomeShelfLayout, toggleHomeShelf } =
  shelves;

describe("home shelf layout", () => {
  it("falls back to the default order", () => {
    assert.deepEqual(parseHomeShelfLayout(null).order, [...HOME_SHELVES]);
    assert.deepEqual(parseHomeShelfLayout("not json").order, [...HOME_SHELVES]);
  });

  it("keeps the stored order and slots new shelves in after their neighbour", () => {
    const layout = parseHomeShelfLayout(
      JSON.stringify({
        order: ["catalogue", "activity", "bogus", "continue_playing"],
        hidden: ["activity", "bogus"],
      })
    );
    assert.deepEqual(layout.order.slice(0, 4), [
      "catalogue",
      "activity",
      "continue_playing",
      "downloads",
    ]);
    assert.equal(layout.order.length, HOME_SHELVES.length);
    assert.deepEqual(layout.hidden, ["activity"]);
  });

  it("moves and hides shelves", () => {
    const layout = parseHomeShelfLayout(null);
    const moved = moveHomeShelf(layout, "continue_playing", -1);
    assert.deepEqual(moved.order.slice(0, 2), ["continue_playing", "activity"]);
    assert.equal(moveHomeShelf(layout, "activity", -1), layout);
    const hidden = toggleHomeShelf(layout, "news");
    assert.deepEqual(hidden.hidden, ["news"]);
    assert.deepEqual(toggleHomeShelf(hidden, "news").hidden, []);
  });
});
