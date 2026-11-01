import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  NOTICES_ONLY_MANGOHUD_CONFIG,
  resolveInGameNotices,
  withInGameNotices,
} from "./in-game-notices.js";

describe("withInGameNotices", () => {
  it("adds each notice as a centred custom text line", () => {
    assert.equal(
      withInGameNotices("fps\n", ["Achievement unlocked: A", "B"]),
      "fps\ncustom_text_center=Achievement unlocked: A\ncustom_text_center=B\n"
    );
  });

  it("keeps a notice on one line, so it can't add config keys", () => {
    assert.equal(
      withInGameNotices("fps", ["evil\nno_display"]),
      "fps\ncustom_text_center=evil no_display\n"
    );
  });

  it("leaves the config alone without notices", () => {
    assert.equal(
      withInGameNotices(NOTICES_ONLY_MANGOHUD_CONFIG, []),
      NOTICES_ONLY_MANGOHUD_CONFIG
    );
  });
});

describe("resolveInGameNotices", () => {
  it("is on by default where MangoHud is installed", () => {
    assert.equal(resolveInGameNotices(undefined, true), true);
    assert.equal(resolveInGameNotices(undefined, false), false);
    assert.equal(resolveInGameNotices(false, true), false);
  });
});
