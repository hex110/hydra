import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  installWidescreenPatch,
  uninstallWidescreenPatch,
} from "../widescreen-patch/game-files.js";
import { mergeDirectoryInto } from "./update-files.js";
import {
  liftToolOverlays,
  readToolOriginals,
  restoreToolOverlays,
  toolOverlaysForGame,
} from "./tool-overlays.js";

let root: string;
let game: string;

const write = (relative: string, content: string) => {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
};
const read = (relative: string) =>
  fs.readFileSync(path.join(game, relative), "utf8");

/** Installs a widescreen patch that replaces Game.exe and adds a proxy DLL. */
const installPatch = async () => {
  write("patch/Game.exe", "exe patched");
  write("patch/dinput8.dll", "proxy");
  await installWidescreenPatch({
    patchId: "test",
    version: "1",
    installDirectory: game,
    files: [
      { source: path.join(root, "patch/Game.exe"), target: "Game.exe" },
      { source: path.join(root, "patch/dinput8.dll"), target: "dinput8.dll" },
    ],
  });
};

const locations = () =>
  toolOverlaysForGame(
    {
      widescreenPatch: {
        directory: game,
        patchId: "test",
        version: "1",
        nativeDll: "dinput8",
        installedAt: "",
      },
    },
    game
  );

const update = async (files: Record<string, string>) => {
  for (const [file, content] of Object.entries(files))
    write(`update/${file}`, content);
  const lifted = await liftToolOverlays(locations());
  const written: string[] = [];
  await mergeDirectoryInto(path.join(root, "update"), game, written);
  return restoreToolOverlays(lifted, written);
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "hydra-tool-overlays-"));
  game = path.join(root, "game");
  write("game/Game.exe", "exe v1");
  write("game/Data/level.pak", "level v1");
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("tool overlays during a game update", () => {
  it("compares the update with the game's own copy of a replaced file", async () => {
    await installPatch();
    const originals = await readToolOriginals(locations());
    assert.strictEqual(
      fs.readFileSync(originals.get(path.join(game, "Game.exe"))!, "utf8"),
      "exe v1"
    );
  });

  it("lays the tool back when the update leaves its files alone", async () => {
    await installPatch();
    const outcome = await update({ "Data/level.pak": "level v2" });

    assert.deepStrictEqual(outcome, {
      restored: ["widescreen-patch"],
      removed: [],
    });
    assert.strictEqual(read("Game.exe"), "exe patched");
    assert.strictEqual(read("dinput8.dll"), "proxy");
    assert.strictEqual(read("Data/level.pak"), "level v2");
    assert.ok(!fs.existsSync(path.join(game, ".hydra-update-stash")));

    // Removing it still restores the game's own exe.
    await uninstallWidescreenPatch(game);
    assert.strictEqual(read("Game.exe"), "exe v1");
    assert.ok(!fs.existsSync(path.join(game, "dinput8.dll")));
  });

  it("removes a version-specific patch whose files the update replaced", async () => {
    await installPatch();
    const outcome = await update({ "Game.exe": "exe v2" });

    assert.deepStrictEqual(outcome, {
      restored: [],
      removed: ["widescreen-patch"],
    });
    assert.strictEqual(read("Game.exe"), "exe v2");
    assert.ok(!fs.existsSync(path.join(game, "dinput8.dll")));
    assert.ok(!fs.existsSync(path.join(game, ".hydra-widescreen-patch.json")));
  });

  it("backs up the updated file when it lays a tool back over it", async () => {
    // OptiScaler is not version-specific: it goes back over the new file.
    write("game/OptiScaler.ini", "ini");
    write("game/dxgi.dll", "game dxgi v1");
    fs.mkdirSync(path.join(game, ".hydra-optiscaler-backup"));
    fs.renameSync(
      path.join(game, "dxgi.dll"),
      path.join(game, ".hydra-optiscaler-backup/dxgi.dll")
    );
    write("game/dxgi.dll", "optiscaler");
    fs.writeFileSync(
      path.join(game, ".hydra-optiscaler.json"),
      JSON.stringify({
        files: ["dxgi.dll", "OptiScaler.ini"],
        directories: [],
        backups: ["dxgi.dll"],
      })
    );
    const optiScaler = toolOverlaysForGame(
      {
        optiScaler: {
          directory: game,
          version: "1",
          proxyDll: "dxgi.dll",
          installedAt: "",
        },
      },
      game
    );

    write("update/dxgi.dll", "game dxgi v2");
    const lifted = await liftToolOverlays(optiScaler);
    assert.strictEqual(read("dxgi.dll"), "game dxgi v1");
    const written: string[] = [];
    await mergeDirectoryInto(path.join(root, "update"), game, written);
    const outcome = await restoreToolOverlays(lifted, written);

    assert.deepStrictEqual(outcome, { restored: ["optiscaler"], removed: [] });
    assert.strictEqual(read("dxgi.dll"), "optiscaler");
    assert.strictEqual(
      read(".hydra-optiscaler-backup/dxgi.dll"),
      "game dxgi v2"
    );
  });
});

describe("removing a tool after something else replaced its file", () => {
  it("keeps the new file instead of restoring the stale backup", async () => {
    await installPatch();
    // A launcher's update writes a new exe over the patched one.
    fs.writeFileSync(path.join(game, "Game.exe"), "exe v2");

    await uninstallWidescreenPatch(game);
    assert.strictEqual(read("Game.exe"), "exe v2");
    assert.ok(!fs.existsSync(path.join(game, "dinput8.dll")));
  });
});
