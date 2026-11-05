import { describe, it } from "node:test";
import assert from "node:assert";
import {
  WIDESCREEN_PATCHES,
  findWidescreenPatch,
} from "./widescreen-patches.js";

describe("findWidescreenPatch", () => {
  it("offers MOLE's patch to the Steam game only", () => {
    assert.strictEqual(
      findWidescreenPatch("steam", "4064510")?.nativeDll,
      "winmm"
    );
    assert.strictEqual(findWidescreenPatch("steam", "1"), null);
    assert.strictEqual(findWidescreenPatch("custom", "4064510"), null);
  });

  it("pins every package to a commit and a hash", () => {
    for (const patch of WIDESCREEN_PATCHES) {
      assert.match(patch.package.url, /\/raw\/commit\/[0-9a-f]{40}\//);
      assert.match(patch.package.sha256, /^[0-9a-f]{64}$/);
    }
  });
});
