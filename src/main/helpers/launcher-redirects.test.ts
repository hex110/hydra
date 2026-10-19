import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  findLauncherRedirect,
  getLaunchExecutable,
} from "./launcher-redirects.ts";

let root: string;

const touch = (relativePath: string) => {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
  return filePath;
};

describe("findLauncherRedirect", () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "hydra-launchers-"));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("redirects a root launcher to the game it starts", () => {
    const launcher = touch("Cyberpunk 2077/REDprelauncher.exe");
    const game = touch("Cyberpunk 2077/bin/x64/Cyberpunk2077.exe");

    assert.strictEqual(findLauncherRedirect(launcher), game);
  });

  it("picks the target that exists when a launcher name is shared", () => {
    const launcher = touch("The Witcher 3/REDprelauncher.exe");
    const game = touch("The Witcher 3/bin/x64_dx12/witcher3.exe");

    assert.strictEqual(findLauncherRedirect(launcher), game);
  });

  it("resolves a launcher in a subfolder from the game root", () => {
    const launcher = touch("BG3/Launcher/LariLauncher.exe");
    const game = touch("BG3/bin/bg3_dx11.exe");

    assert.strictEqual(findLauncherRedirect(launcher), game);
  });

  it("matches folder and file names case-insensitively", () => {
    const launcher = touch("Darktide/Launcher/launcher.EXE");
    const game = touch("Darktide/Binaries/Darktide.exe");

    assert.strictEqual(findLauncherRedirect(launcher), game);
  });

  it("leaves a generic launcher alone when no known game is next to it", () => {
    const launcher = touch("Some Game/Launcher.exe");
    touch("Some Game/SomeGame.exe");

    assert.strictEqual(findLauncherRedirect(launcher), null);
  });

  it("ignores executables that are not launchers", () => {
    assert.strictEqual(
      findLauncherRedirect(touch("Cyberpunk 2077/bin/x64/Cyberpunk2077.exe")),
      null
    );
  });
});

describe("getLaunchExecutable", () => {
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "hydra-launchers-"));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("keeps the launcher when the game asks for it", () => {
    const launcher = touch("HITMAN 3/Launcher.exe");
    const game = touch("HITMAN 3/Retail/HITMAN3.exe");

    assert.strictEqual(getLaunchExecutable(undefined, launcher), game);
    assert.strictEqual(
      getLaunchExecutable({ useGameLauncher: true }, launcher),
      launcher
    );
  });
});
