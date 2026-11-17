import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { moveArchive } from "./move-archive.ts";

describe("moveArchive", () => {
  let root = "";

  beforeEach(async () => {
    root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "move-archive-"));
  });

  afterEach(async () => {
    mock.restoreAll();
    await fs.promises.rm(root, { recursive: true, force: true });
  });

  const archive = async (bytes: number) => {
    const from = path.join(root, "downloads", "Game-AnkerGames.zip");
    await fs.promises.mkdir(path.dirname(from), { recursive: true });
    await fs.promises.writeFile(from, Buffer.alloc(bytes, 7));
    return { from, to: path.join(root, "games", "Game-AnkerGames.zip") };
  };

  it("renames on the same drive without a copy", async () => {
    const { from, to } = await archive(1024);
    const move = moveArchive(from, to);
    await move.done;

    assert.equal(move.total, 0);
    assert.equal(fs.existsSync(from), false);
    assert.equal((await fs.promises.stat(to)).size, 1024);
  });

  it("copies across drives and reports the copied size", async () => {
    const { from, to } = await archive(4096);
    mock.method(fs.promises, "rename", async () => {
      throw Object.assign(new Error("cross-device link"), { code: "EXDEV" });
    });

    const move = moveArchive(from, to);
    assert.equal(moveArchive(from, to), move, "a second call joins the move");
    await move.done;

    assert.equal(move.total, 4096);
    assert.equal(move.copied, 4096);
    assert.equal(fs.existsSync(from), false);
    assert.equal((await fs.promises.stat(to)).size, 4096);
  });

  it("removes a half-written copy when the copy fails", async () => {
    const { from, to } = await archive(2048);
    mock.method(fs.promises, "rename", async () => {
      throw Object.assign(new Error("cross-device link"), { code: "EXDEV" });
    });
    mock.method(fs.promises, "copyFile", async () => {
      await fs.promises.writeFile(to, "partial");
      throw new Error("disk full");
    });

    await assert.rejects(moveArchive(from, to).done, /disk full/);
    assert.equal(fs.existsSync(to), false);
    assert.equal(fs.existsSync(from), true);
  });
});
