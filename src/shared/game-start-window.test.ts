import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveHideToTrayOnGameStart } from "./game-start-window.js";

const GiB = 1024 ** 3;

describe("resolveHideToTrayOnGameStart", () => {
  it("closes the window by default on a machine with little memory", () => {
    assert.equal(resolveHideToTrayOnGameStart(undefined, 7.4 * GiB), true);
  });

  it("keeps it open by default on a machine with plenty", () => {
    assert.equal(resolveHideToTrayOnGameStart(undefined, 60 * GiB), false);
  });

  it("follows the user's choice either way", () => {
    assert.equal(resolveHideToTrayOnGameStart(false, 4 * GiB), false);
    assert.equal(resolveHideToTrayOnGameStart(true, 64 * GiB), true);
  });
});
