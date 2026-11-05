import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, it } from "node:test";
import { clearRealPathCache, getRealPath } from "./real-path-cache.js";

afterEach(() => clearRealPathCache());

it("resolves a symlinked game path to the path its process reports", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "real-path-"));
  try {
    const real = path.join(root, "share", "Steam");
    fs.mkdirSync(real, { recursive: true });
    fs.writeFileSync(path.join(real, "Game"), "");
    fs.symlinkSync(real, path.join(root, "steam"));

    assert.equal(
      await getRealPath(path.join(root, "steam", "Game")),
      fs.realpathSync(path.join(real, "Game"))
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it("returns a missing path unchanged", async () => {
  assert.equal(await getRealPath("/no/such/game"), "/no/such/game");
});
