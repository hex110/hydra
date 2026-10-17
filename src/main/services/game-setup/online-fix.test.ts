import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { copySteamClientFiles, detectOnlineFix } from "./online-fix.ts";

let root: string;

const write = (relativePath: string, content = relativePath) => {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "hydra-onlinefix-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("detectOnlineFix", () => {
  it("finds OnlineFix and the proxy DLLs beside it", async () => {
    write("game/Game.exe");
    write("game/Proj/Binaries/Win64/OnlineFix64.dll");
    write("game/Proj/Binaries/Win64/OnlineFix.ini");
    write("game/Proj/Binaries/Win64/WINMM.dll");
    write("game/Proj/Binaries/Win64/dxgi.dll");

    assert.deepStrictEqual(await detectOnlineFix(path.join(root, "game")), {
      directory: path.join(root, "game/Proj/Binaries/Win64"),
      proxyDlls: ["winmm"],
    });
  });

  it("returns null for games without OnlineFix", async () => {
    write("game/Game.exe");
    write("game/winmm.dll");
    assert.strictEqual(await detectOnlineFix(path.join(root, "game")), null);
  });
});

describe("copySteamClientFiles", () => {
  it("takes each file from the first source that has it", async () => {
    write("linux-steam/steamclient64.dll", "linux");
    write("linux-steam/steamclient.dll", "linux");
    write("windows-steam/steamclient64.dll", "windows");
    write("windows-steam/tier0_s64.dll", "windows");
    write("prefix/drive_c/Program Files (x86)/Steam/vstdlib_s64.dll", "kept");

    const result = await copySteamClientFiles(path.join(root, "prefix"), [
      path.join(root, "linux-steam"),
      path.join(root, "windows-steam"),
      path.join(root, "missing"),
    ]);

    const steam = path.join(root, "prefix/drive_c/Program Files (x86)/Steam");
    assert.deepStrictEqual(result, {
      copied: ["steamclient64.dll", "steamclient.dll", "tier0_s64.dll"],
      missing: ["GameOverlayRenderer64.dll"],
    });
    assert.strictEqual(
      fs.readFileSync(path.join(steam, "steamclient64.dll"), "utf8"),
      "linux"
    );
    assert.strictEqual(
      fs.readFileSync(path.join(steam, "vstdlib_s64.dll"), "utf8"),
      "kept"
    );
  });
});
