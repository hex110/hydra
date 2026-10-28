import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  findMissingOptiScalerFiles,
  findOccupiedFileNames,
  findReleaseRoot,
  findUpscalerLibraries,
  hasExternalOptiScaler,
  installOptiScaler,
  readOptiScalerManifest,
  resolveGameRootForDetection,
  resolveOptiScalerInstallDirectory,
  uninstallOptiScaler,
  OPTISCALER_MANIFEST_FILE,
} from "./game-files.ts";

let root: string;

const write = (relativePath: string, content = relativePath) => {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return target;
};

const read = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

const has = (relativePath: string) =>
  fs.existsSync(path.join(root, relativePath));

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "hydra-optiscaler-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("resolveOptiScalerInstallDirectory", () => {
  it("uses the executable folder for ordinary games", async () => {
    const exe = write("Game/Game.exe");
    assert.strictEqual(
      await resolveOptiScalerInstallDirectory(exe),
      path.join(root, "Game")
    );
  });

  it("follows Unreal bootstrap executables to the shipping binary", async () => {
    const exe = write("Returnal/Returnal.exe");
    write("Returnal/Engine/Binaries/Win64/CrashReporter-Win64-Shipping.exe");
    write("Returnal/Returnal/Binaries/Win64/Returnal-Win64-Shipping.exe");
    const directory = await resolveOptiScalerInstallDirectory(exe);
    assert.strictEqual(
      directory,
      path.join(root, "Returnal/Returnal/Binaries/Win64")
    );
    assert.strictEqual(
      resolveGameRootForDetection(directory),
      path.join(root, "Returnal")
    );
  });

  it("keeps a shipping executable that is launched directly", async () => {
    const exe = write("RA/Everholm/Binaries/Win64/REANIMAL.exe");
    assert.strictEqual(
      await resolveOptiScalerInstallDirectory(exe),
      path.join(root, "RA/Everholm/Binaries/Win64")
    );
  });
});

describe("findUpscalerLibraries", () => {
  it("finds upscalers anywhere in the game and skips ignored files", async () => {
    write("Engine/Binaries/ThirdParty/NVIDIA/NGX/Win64/nvngx_dlss.dll");
    const ours = write("Game/Binaries/Win64/libxess.dll");
    write("Game/Binaries/Win64/dxgi.dll");

    const found = await findUpscalerLibraries(
      root,
      new Set([path.resolve(ours)])
    );
    assert.deepStrictEqual(found, [
      path.join("Engine/Binaries/ThirdParty/NVIDIA/NGX/Win64/nvngx_dlss.dll"),
    ]);
  });
});

describe("findReleaseRoot", () => {
  it("accepts archives with or without a top-level folder", async () => {
    write("flat/OptiScaler.dll");
    write("nested/OptiScaler_0.9.4/OptiScaler.dll");
    write("empty/readme.txt");
    assert.strictEqual(
      await findReleaseRoot(path.join(root, "flat")),
      path.join(root, "flat")
    );
    assert.strictEqual(
      await findReleaseRoot(path.join(root, "nested")),
      path.join(root, "nested/OptiScaler_0.9.4")
    );
    assert.strictEqual(await findReleaseRoot(path.join(root, "empty")), null);
  });
});

describe("installOptiScaler / uninstallOptiScaler", () => {
  const setup = () => {
    write("release/OptiScaler.dll", "opti");
    write(
      "release/OptiScaler.ini",
      "[Menu]\nShortcutKey=auto\n\n[Plugins]\nPath=auto\n"
    );
    write("release/libxess.dll", "new xess");
    write("release/D3D12_Optiscaler/D3D12Core.dll");
    write("release/setup_linux.sh");
    write("release/!! README_EXTRACT ALL FILES TO GAME FOLDER !!.txt");
    write("asi/OptiPatcher_v0.41.asi", "patcher");
    write("game/Game.exe");
    write("game/libxess.dll", "old xess");
    write("game/dxgi.dll", "reshade");
  };

  const install = () =>
    installOptiScaler({
      releaseDirectory: path.join(root, "release"),
      installDirectory: path.join(root, "game"),
      version: "0.9.4",
      channel: "stable",
      proxyDll: "dxgi.dll",
      iniOverrides: [{ section: "Menu", key: "ShortcutKey", value: "0x78" }],
      optiPatcher: {
        path: path.join(root, "asi/OptiPatcher_v0.41.asi"),
        version: "0.41",
      },
    });

  it("installs the release, backs up replaced files and applies overrides", async () => {
    setup();
    const manifest = await install();

    assert.strictEqual(read("game/dxgi.dll"), "opti");
    assert.strictEqual(read("game/libxess.dll"), "new xess");
    assert.strictEqual(read("game/plugins/OptiPatcher.asi"), "patcher");
    assert.ok(has("game/D3D12_Optiscaler/D3D12Core.dll"));
    assert.ok(!has("game/setup_linux.sh"));
    assert.ok(!has("game/OptiScaler.dll"));
    assert.ok(read("game/OptiScaler.ini").includes("ShortcutKey=0x78"));
    assert.ok(
      read("game/OptiScaler.ini").includes("Path=auto\nLoadAsiPlugins=true")
    );

    assert.deepStrictEqual(manifest.backups.sort(), [
      "dxgi.dll",
      "libxess.dll",
    ]);
    assert.deepStrictEqual(manifest.directories.sort(), [
      "D3D12_Optiscaler",
      "plugins",
    ]);
    assert.strictEqual(
      (await readOptiScalerManifest(path.join(root, "game")))?.version,
      "0.9.4"
    );
    assert.strictEqual(
      await hasExternalOptiScaler(path.join(root, "game")),
      false
    );
  });

  it("uninstalls exactly what it installed and restores backups", async () => {
    setup();
    await install();
    write("game/OptiScaler.log");
    write("game/plugins/user-plugin.asi");

    assert.ok(await uninstallOptiScaler(path.join(root, "game")));

    assert.strictEqual(read("game/dxgi.dll"), "reshade");
    assert.strictEqual(read("game/libxess.dll"), "old xess");
    assert.deepStrictEqual(fs.readdirSync(path.join(root, "game")).sort(), [
      "Game.exe",
      "dxgi.dll",
      "libxess.dll",
      "plugins",
    ]);
    assert.deepStrictEqual(fs.readdirSync(path.join(root, "game/plugins")), [
      "user-plugin.asi",
    ]);
  });

  it("reinstalls over an earlier install without losing the original files", async () => {
    setup();
    await install();
    await install();
    await uninstallOptiScaler(path.join(root, "game"));
    assert.strictEqual(read("game/dxgi.dll"), "reshade");
    assert.strictEqual(read("game/libxess.dll"), "old xess");
  });

  it("lists installed files that were removed outside Hydra", async () => {
    setup();
    const manifest = await install();
    const game = path.join(root, "game");
    assert.deepStrictEqual(
      await findMissingOptiScalerFiles(game, manifest),
      []
    );

    // What GOverlay's bgmod deletes: everything but the proxy DLL.
    fs.rmSync(path.join(game, "OptiScaler.ini"));
    fs.rmSync(path.join(game, "plugins"), { recursive: true });
    assert.deepStrictEqual(
      (await findMissingOptiScalerFiles(game, manifest)).sort(),
      ["OptiScaler.ini", path.join("plugins", "OptiPatcher.asi")].sort()
    );
  });

  it("detects OptiScaler installed by another tool", async () => {
    write("other/OptiScaler.ini");
    assert.ok(await hasExternalOptiScaler(path.join(root, "other")));
    assert.strictEqual(
      await uninstallOptiScaler(path.join(root, "other")),
      false
    );
  });

  it("refuses manifests that point outside the game", async () => {
    write("victim.txt");
    write(
      `game/${OPTISCALER_MANIFEST_FILE}`,
      JSON.stringify({ files: ["../victim.txt"], directories: [], backups: [] })
    );
    await assert.rejects(uninstallOptiScaler(path.join(root, "game")));
    assert.ok(has("victim.txt"));
  });
});

describe("findOccupiedFileNames", () => {
  const manifest = (files: string[], backups: string[] = []) => ({
    version: "1",
    channel: "stable" as const,
    proxyDll: "dxgi.dll" as const,
    optiPatcherVersion: null,
    installedAt: "",
    files,
    directories: [],
    backups,
  });

  it("lists the game's own files, lower-cased, without folders", async () => {
    write("Winmm.dll");
    write("game.exe");
    write("data/dbghelp.dll");
    assert.deepStrictEqual(
      [...(await findOccupiedFileNames(root, null))].sort(),
      ["game.exe", "winmm.dll"]
    );
  });

  it("leaves out OptiScaler's own files and adds the ones it backed up", async () => {
    write("dxgi.dll");
    write("OptiScaler.ini");
    write("winmm.dll");
    assert.deepStrictEqual(
      [
        ...(await findOccupiedFileNames(
          root,
          manifest(
            ["dxgi.dll", "OptiScaler.ini", "OptiScaler/x.dll"],
            ["version.dll"]
          )
        )),
      ].sort(),
      ["version.dll", "winmm.dll"]
    );
  });

  it("is empty for a folder that cannot be read", async () => {
    assert.strictEqual(
      (await findOccupiedFileNames(path.join(root, "missing"), null)).size,
      0
    );
  });
});
