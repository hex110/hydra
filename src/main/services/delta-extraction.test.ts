import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import type { ArchiveEntry } from "./archive-entry.js";
import {
  canPlanDelta,
  crc32OfFile,
  findArchiveRoot,
  planDeltaExtraction,
} from "./delta-extraction.js";

let root: string;

const write = (relative: string, content: string) => {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};

const entry = (name: string, content: string): ArchiveEntry => ({
  name,
  size: Buffer.byteLength(content),
  crc: zlib.crc32(content),
});

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "hydra-delta-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("crc32OfFile", () => {
  it("matches the CRC-32 of the content, across chunk boundaries", async () => {
    const content = "abc".repeat(3_000_000);
    write("big.bin", content);
    assert.strictEqual(
      await crc32OfFile(path.join(root, "big.bin")),
      zlib.crc32(content)
    );
  });
});

describe("planDeltaExtraction", () => {
  it("extracts only new and different files", async () => {
    write("game/same.dat", "same");
    write("game/edited.dat", "old!");
    write("game/sub/same2.dat", "again");
    const plan = await planDeltaExtraction(
      [
        entry("same.dat", "same"),
        entry("edited.dat", "new!"),
        entry("sub/same2.dat", "again"),
        entry("added.dat", "fresh"),
      ],
      path.join(root, "game")
    );
    assert.deepStrictEqual(plan.changed.map((e) => e.name).sort(), [
      "added.dat",
      "edited.dat",
    ]);
    assert.strictEqual(plan.unchangedCount, 2);
    assert.strictEqual(plan.changedBytes, 4 + 5);
    assert.strictEqual(plan.unchangedBytes, 4 + 5);
  });

  it("treats a different size without reading the file", async () => {
    write("game/a.dat", "short");
    const plan = await planDeltaExtraction(
      [entry("a.dat", "much longer")],
      path.join(root, "game")
    );
    assert.strictEqual(plan.changed.length, 1);
  });

  it("extracts everything into a folder that does not exist", async () => {
    const plan = await planDeltaExtraction(
      [entry("a.dat", "aa"), entry("b/c.dat", "ccc")],
      path.join(root, "missing")
    );
    assert.strictEqual(plan.changed.length, 2);
    assert.strictEqual(plan.unchangedCount, 0);
  });

  it("keeps empty files that already exist and extracts missing ones", async () => {
    write("game/empty.txt", "");
    const plan = await planDeltaExtraction(
      [
        { name: "empty.txt", size: 0 },
        { name: "other.txt", size: 0 },
      ],
      path.join(root, "game")
    );
    assert.deepStrictEqual(
      plan.changed.map((e) => e.name),
      ["other.txt"]
    );
  });

  it("compares under the archive root and ignores entries outside it", async () => {
    write("installed/Game/game.exe", "exe");
    write("installed/Game/data.dat", "old");
    const plan = await planDeltaExtraction(
      [
        entry("Release v2/Game/game.exe", "exe"),
        entry("Release v2/Game/data.dat", "new"),
        entry("Release v2/readme.txt", "hi"),
        entry("Other/file.txt", "x"),
      ],
      path.join(root, "installed"),
      { root: "Release v2" }
    );
    assert.deepStrictEqual(plan.changed.map((e) => e.name).sort(), [
      "Release v2/Game/data.dat",
      "Release v2/readme.txt",
    ]);
  });

  it("compares a tool-replaced file with the game's own copy", async () => {
    write("game/dxgi.dll", "optiscaler");
    write("backup/dxgi.dll", "game dxgi");
    const plan = await planDeltaExtraction(
      [entry("dxgi.dll", "game dxgi")],
      path.join(root, "game"),
      {
        originals: new Map([
          [
            path.join(root, "game/dxgi.dll"),
            path.join(root, "backup/dxgi.dll"),
          ],
        ]),
      }
    );
    assert.strictEqual(plan.changed.length, 0);
  });

  it("never matches a name that climbs out of the folder", async () => {
    write("evil.txt", "x");
    const plan = await planDeltaExtraction(
      [entry("../evil.txt", "x")],
      path.join(root, "game")
    );
    assert.strictEqual(plan.changed.length, 1);
  });

  it("reports progress up to 1 while hashing", async () => {
    write("game/a.dat", "aaaa");
    write("game/b.dat", "bbbb");
    const seen: number[] = [];
    await planDeltaExtraction(
      [entry("a.dat", "aaaa"), entry("b.dat", "bbbb")],
      path.join(root, "game"),
      { onProgress: (fraction) => seen.push(fraction) }
    );
    assert.strictEqual(seen.at(-1), 1);
  });
});

describe("findArchiveRoot", () => {
  const files = (...names: string[]): ArchiveEntry[] =>
    names.map((name) => ({ name, size: 1, crc: 1 }));

  it("finds the top level", () => {
    assert.strictEqual(
      findArchiveRoot(files("Game/Game.exe", "Game/a.dat"), [
        "Game",
        "Game.exe",
      ]),
      ""
    );
  });

  it("finds a wrapping folder, ignoring case", () => {
    assert.strictEqual(
      findArchiveRoot(files("Game v1.1/game/GAME.EXE"), ["Game", "Game.exe"]),
      "Game v1.1"
    );
  });

  it("prefers the shallowest match", () => {
    assert.strictEqual(
      findArchiveRoot(files("a/b/x.exe", "x.exe"), ["x.exe"]),
      ""
    );
  });

  it("returns null when the executable is not in the archive", () => {
    assert.strictEqual(findArchiveRoot(files("a/y.exe"), ["x.exe"]), null);
  });
});

describe("canPlanDelta", () => {
  it("needs a CRC for every non-empty file and no encryption", () => {
    assert.ok(
      canPlanDelta([
        { name: "a", size: 1, crc: 1 },
        { name: "e", size: 0 },
      ])
    );
    assert.ok(!canPlanDelta([{ name: "a", size: 1 }]));
    assert.ok(!canPlanDelta([{ name: "a", size: 1, crc: 1, encrypted: true }]));
    assert.ok(!canPlanDelta([]));
  });
});
