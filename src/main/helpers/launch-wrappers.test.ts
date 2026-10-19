import { describe, it } from "node:test";
import assert from "node:assert";
import { findConflictingWrappers } from "./launch-wrappers.ts";

describe("findConflictingWrappers", () => {
  it("finds nothing without launch options", () => {
    assert.deepStrictEqual(findConflictingWrappers(null), []);
    assert.deepStrictEqual(findConflictingWrappers("DXVK_HDR=1 %command%"), []);
  });

  it("finds bgmod by its full path, quoted or not", () => {
    assert.deepStrictEqual(
      findConflictingWrappers(
        "~/.local/share/goverlay/gameconfig/global/bgmod %command%"
      ),
      ["bgmod"]
    );
    assert.deepStrictEqual(
      findConflictingWrappers(
        `"/home/user/my games/fgmod" bgmod %command% -dx12`
      ),
      ["fgmod", "bgmod"]
    );
  });

  it("ignores names that only contain a wrapper's name", () => {
    assert.deepStrictEqual(
      findConflictingWrappers("bgmod-uninstaller.sh %command% -bgmod"),
      []
    );
  });
});
