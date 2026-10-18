import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { locateUpdateRoot, mergeDirectoryInto } from "./update-files.js";

let root: string;

const write = (relative: string, content = "x") => {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "hydra-update-files-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("locateUpdateRoot", () => {
  it("finds the executable under an extra wrapping folder", async () => {
    write("installed/Game/Binaries/Win64/Game-Win64-Shipping.exe");
    write("update/Game v1.1/Game/Binaries/Win64/game-win64-shipping.exe");
    const found = await locateUpdateRoot(
      path.join(root, "update"),
      path.join(root, "installed"),
      path.join(root, "installed/Game/Binaries/Win64/Game-Win64-Shipping.exe")
    );
    assert.strictEqual(found, path.join(root, "update", "Game v1.1"));
  });

  it("falls back to matching top-level entries", async () => {
    write("installed/game.exe");
    write("installed/data/a.pak");
    write("update/Release/launcher.exe");
    write("update/Release/data/a.pak");
    const found = await locateUpdateRoot(
      path.join(root, "update"),
      path.join(root, "installed"),
      path.join(root, "installed/game.exe")
    );
    assert.strictEqual(found, path.join(root, "update", "Release"));
  });

  it("gives up on unrelated files", async () => {
    write("installed/game.exe");
    write("update/setup.exe");
    write("update/setup-1.bin");
    const found = await locateUpdateRoot(
      path.join(root, "update"),
      path.join(root, "installed"),
      path.join(root, "installed/game.exe")
    );
    assert.strictEqual(found, null);
  });
});

describe("mergeDirectoryInto", () => {
  it("replaces updated files and keeps the others", async () => {
    write("installed/game.exe", "old");
    write("installed/saves/slot1.sav", "save");
    write("update/game.exe", "new");
    write("update/data/new.pak", "pak");
    const moved = await mergeDirectoryInto(
      path.join(root, "update"),
      path.join(root, "installed")
    );
    assert.strictEqual(moved, 2);
    assert.strictEqual(
      fs.readFileSync(path.join(root, "installed/game.exe"), "utf8"),
      "new"
    );
    assert.ok(fs.existsSync(path.join(root, "installed/saves/slot1.sav")));
    assert.ok(fs.existsSync(path.join(root, "installed/data/new.pak")));
  });
});
