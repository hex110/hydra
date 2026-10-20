import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-ignore The Node ESM test runner requires the source extension.
import * as collections from "./local-collections.ts";

const { getRemoteCollectionIds, isLocalCollectionId, replaceCollectionId } =
  collections;

describe("local collections", () => {
  it("tells local ids from account ones", () => {
    assert.equal(isLocalCollectionId("local-1"), true);
    assert.equal(isLocalCollectionId("6650f0c1"), false);
    assert.deepEqual(getRemoteCollectionIds(["a", "local-1", "b"]), ["a", "b"]);
  });

  it("replaces a local id without duplicating the account one", () => {
    assert.deepEqual(replaceCollectionId(["local-1", "x"], "local-1", "r"), [
      "r",
      "x",
    ]);
    assert.deepEqual(replaceCollectionId(["local-1", "r"], "local-1", "r"), [
      "r",
    ]);
  });
});
