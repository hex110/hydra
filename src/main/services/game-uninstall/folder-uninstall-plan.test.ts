import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  planFolderUninstall,
  type FolderUninstallInput,
} from "./folder-uninstall-plan.js";

let home: string;

const touch = (...parts: string[]) => {
  const file = path.join(home, ...parts);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "");
  return file;
};

const makePrefix = (...parts: string[]) => {
  const prefix = path.join(home, ...parts);
  fs.mkdirSync(path.join(prefix, "pfx", "drive_c"), { recursive: true });
  return prefix;
};

const input = (
  overrides: Partial<FolderUninstallInput>
): FolderUninstallInput => ({
  executablePath: null,
  libraryRoots: [],
  steamLibraries: [],
  prefixPath: null,
  defaultPrefixRoot: path.join(home, "prefixes"),
  otherExecutables: [],
  otherPrefixes: [],
  homeDir: home,
  ...overrides,
});

describe("planFolderUninstall", () => {
  beforeEach(() => {
    home = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "hydra-uninstall-"))
    );
  });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  it("takes the folder directly inside a library folder", async () => {
    const exe = touch("Library", "Hollow Knight", "bin", "game.exe");
    touch("Library", "Other Game", "other.exe");
    const result = await planFolderUninstall(
      input({
        executablePath: exe,
        libraryRoots: [path.join(home, "Library")],
      })
    );
    assert.deepEqual(result, {
      ok: true,
      plan: {
        folder: path.join(home, "Library", "Hollow Knight"),
        prefix: null,
      },
    });
  });

  it("climbs out of parents that hold only the game", async () => {
    const exe = touch("Stuff", "Celeste-v1.4", "Celeste", "Celeste.exe");
    touch("Stuff", "Celeste-v1.4", "Celeste", "Content", "a.pak");
    touch("Stuff", "notes.txt");
    const result = await planFolderUninstall(input({ executablePath: exe }));
    assert.equal(
      result.ok && result.plan.folder,
      path.join(home, "Stuff", "Celeste-v1.4")
    );
  });

  it("never climbs into a folder named like a games folder", async () => {
    const exe = touch("Games", "Celeste", "Celeste.exe");
    const result = await planFolderUninstall(input({ executablePath: exe }));
    assert.equal(
      result.ok && result.plan.folder,
      path.join(home, "Games", "Celeste")
    );
  });

  it("refuses an executable in the home folder", async () => {
    const exe = touch("game.exe");
    const result = await planFolderUninstall(input({ executablePath: exe }));
    assert.deepEqual(result, { ok: false, error: "protected-folder" });
  });

  it("refuses a folder holding another game", async () => {
    const exe = touch("Pack", "a.exe");
    const result = await planFolderUninstall(
      input({
        executablePath: exe,
        otherExecutables: [path.join(home, "Pack", "b.exe")],
      })
    );
    assert.deepEqual(result, { ok: false, error: "shared-folder" });
  });

  it("refuses Steam games", async () => {
    const exe = touch("Steam", "steamapps", "common", "Game", "game.exe");
    const result = await planFolderUninstall(
      input({
        executablePath: exe,
        steamLibraries: [path.join(home, "Steam")],
      })
    );
    assert.deepEqual(result, { ok: false, error: "steam-managed" });
  });

  it("includes the game's own prefix", async () => {
    const exe = touch("Stuff", "Game", "game.exe");
    touch("Stuff", "other.txt");
    const prefix = makePrefix("prefixes", "123");
    const result = await planFolderUninstall(
      input({ executablePath: exe, prefixPath: prefix })
    );
    assert.equal(result.ok && result.plan.prefix, prefix);
  });

  it("keeps a prefix another game uses, and the prefix root", async () => {
    const exe = touch("Stuff", "Game", "game.exe");
    touch("Stuff", "other.txt");
    const prefix = makePrefix("shared");
    const shared = await planFolderUninstall(
      input({
        executablePath: exe,
        prefixPath: prefix,
        otherPrefixes: [prefix],
      })
    );
    assert.equal(shared.ok && shared.plan.prefix, null);

    const root = makePrefix("prefixes");
    const atRoot = await planFolderUninstall(
      input({ executablePath: exe, prefixPath: root })
    );
    assert.equal(atRoot.ok && atRoot.plan.prefix, null);
  });

  it("ignores a prefix path that isn't a prefix", async () => {
    const exe = touch("Stuff", "Game", "game.exe");
    touch("Stuff", "other.txt");
    fs.mkdirSync(path.join(home, "Documents2"));
    const result = await planFolderUninstall(
      input({ executablePath: exe, prefixPath: path.join(home, "Documents2") })
    );
    assert.equal(result.ok && result.plan.prefix, null);
  });

  it("stops at the drive_c of a prefix the game was installed into", async () => {
    const prefix = makePrefix("prefixes", "123");
    const exe = path.join(prefix, "pfx", "drive_c", "Celeste", "game.exe");
    fs.mkdirSync(path.dirname(exe), { recursive: true });
    fs.writeFileSync(exe, "");
    const result = await planFolderUninstall(
      input({ executablePath: exe, prefixPath: prefix })
    );
    assert.deepEqual(result, {
      ok: true,
      plan: { folder: path.dirname(exe), prefix },
    });
  });
});
