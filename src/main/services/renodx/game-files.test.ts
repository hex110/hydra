import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  findMissingRenoDxFiles,
  hasExternalRenoDx,
  installRenoDx,
  readRenoDxManifest,
  uninstallRenoDx,
} from "./game-files.ts";

let root: string;
let game: string;
let reShade: string;
let addon: string;

const write = (target: string, content: string) => {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return target;
};

const read = (relativePath: string) =>
  fs.readFileSync(path.join(game, relativePath), "utf8");

const has = (relativePath: string) =>
  fs.existsSync(path.join(game, relativePath));

const OVERRIDES = [{ section: "INPUT", key: "KeyOverlay", value: "121,0,0,0" }];

const install = (
  overrides: Partial<Parameters<typeof installRenoDx>[0]> = {}
) =>
  installRenoDx({
    installDirectory: game,
    reShadeDirectory: reShade,
    reShadeVersion: "6.8.0",
    architecture: "x64",
    proxyDll: "dxgi.dll",
    addon: { file: addon, name: "renodx-test.addon64", version: "v1" },
    modId: "test",
    iniOverrides: OVERRIDES,
    ...overrides,
  });

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "hydra-renodx-"));
  game = path.join(root, "game");
  fs.mkdirSync(game);
  reShade = path.join(root, "reshade");
  write(path.join(reShade, "ReShade64.dll"), "reshade64");
  write(path.join(reShade, "ReShade32.dll"), "reshade32");
  addon = write(path.join(root, "renodx-test.addon64"), "addon");
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("installRenoDx", () => {
  it("copies ReShade under the proxy name, the add-on and a seeded ini", async () => {
    const manifest = await install();

    assert.strictEqual(read("dxgi.dll"), "reshade64");
    assert.strictEqual(read("renodx-test.addon64"), "addon");
    assert.ok(read("ReShade.ini").includes("KeyOverlay=121,0,0,0"));
    assert.deepStrictEqual(manifest.files.toSorted(), [
      "ReShade.ini",
      "dxgi.dll",
      "renodx-test.addon64",
    ]);
    assert.deepStrictEqual(await readRenoDxManifest(game), manifest);
  });

  it("uses the 32-bit ReShade for a 32-bit game", async () => {
    await install({ architecture: "x86", proxyDll: "d3d9.dll" });
    assert.strictEqual(read("d3d9.dll"), "reshade32");
  });

  it("moves a file it replaces to a backup and restores it on removal", async () => {
    write(path.join(game, "dxgi.dll"), "original");

    const manifest = await install();
    assert.strictEqual(read("dxgi.dll"), "reshade64");
    assert.deepStrictEqual(manifest.backups, ["dxgi.dll"]);

    await uninstallRenoDx(game);
    assert.strictEqual(read("dxgi.dll"), "original");
    assert.ok(!has(".hydra-renodx-backup"));
  });

  it("removes exactly what it wrote", async () => {
    write(path.join(game, "game.exe"), "exe");
    await install();
    await uninstallRenoDx(game);

    assert.deepStrictEqual(fs.readdirSync(game), ["game.exe"]);
  });

  it("changes an existing ReShade.ini in place and leaves it on removal", async () => {
    write(
      path.join(game, "ReShade.ini"),
      "[GENERAL]\nPresetPath=mine.ini\n[INPUT]\nKeyOverlay=36,0,0,0\n"
    );

    const manifest = await install();
    assert.ok(!manifest.files.includes("ReShade.ini"));
    assert.strictEqual(
      read("ReShade.ini"),
      "[GENERAL]\nPresetPath=mine.ini\n[INPUT]\nKeyOverlay=121,0,0,0\n"
    );

    await uninstallRenoDx(game);
    assert.ok(has("ReShade.ini"));
  });

  it("installs again over its own installation", async () => {
    write(path.join(game, "dxgi.dll"), "original");
    await install();
    await install();

    assert.strictEqual(read("dxgi.dll"), "reshade64");
    await uninstallRenoDx(game);
    assert.strictEqual(read("dxgi.dll"), "original");
  });

  it("puts ReShade beside OptiScaler and turns on LoadReshade", async () => {
    write(path.join(game, "dxgi.dll"), "optiscaler");
    write(path.join(game, "OptiScaler.ini"), "[Plugins]\nLoadReshade=auto\n");

    const manifest = await install({ proxyDll: null });

    assert.strictEqual(read("dxgi.dll"), "optiscaler");
    assert.strictEqual(read("ReShade64.dll"), "reshade64");
    assert.ok(read("OptiScaler.ini").includes("LoadReshade=true"));
    assert.strictEqual(manifest.loadedByOptiScaler, true);
    assert.strictEqual(manifest.reShadeFile, "ReShade64.dll");
  });

  it("undoes a failed install", async () => {
    write(path.join(game, "dxgi.dll"), "original");

    await assert.rejects(
      install({
        addon: {
          file: path.join(root, "missing"),
          name: "a.addon64",
          version: "v",
        },
      })
    );

    assert.strictEqual(read("dxgi.dll"), "original");
    assert.ok(!has(".hydra-renodx.json"));
    assert.ok(!has("a.addon64"));
  });
});

describe("findMissingRenoDxFiles", () => {
  it("lists installed files that were removed outside Hydra", async () => {
    const manifest = await install();
    fs.rmSync(path.join(game, "renodx-test.addon64"));

    assert.deepStrictEqual(await findMissingRenoDxFiles(game, manifest), [
      "renodx-test.addon64",
    ]);
  });
});

describe("hasExternalRenoDx", () => {
  it("is true for an add-on Hydra did not install", async () => {
    write(path.join(game, "renodx-other.addon64"), "x");
    assert.strictEqual(await hasExternalRenoDx(game), true);
  });

  it("is false once Hydra has its manifest, and for a clean folder", async () => {
    assert.strictEqual(await hasExternalRenoDx(game), false);
    await install();
    assert.strictEqual(await hasExternalRenoDx(game), false);
  });
});
