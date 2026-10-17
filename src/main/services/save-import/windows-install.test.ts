import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildWindowsInstallMirror,
  readWindowsInstall,
} from "./windows-install.ts";

let root: string;
const mkdir = (relative: string) =>
  fs.mkdirSync(path.join(root, relative), { recursive: true });

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "hydra-windows-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("readWindowsInstall", () => {
  it("lists real user profiles and finds Steam", () => {
    mkdir("drive/Users/alice/AppData/Roaming");
    mkdir("drive/Users/bob/AppData");
    mkdir("drive/Users/Public/Documents");
    mkdir("drive/Users/Default/AppData");
    mkdir("drive/Users/nothing");
    mkdir("drive/Program Files (x86)/Steam/steamapps");

    assert.deepStrictEqual(readWindowsInstall(path.join(root, "drive")), {
      rootPath: path.join(root, "drive"),
      userProfiles: ["alice", "bob"],
      steamPath: path.join(root, "drive/Program Files (x86)/Steam"),
    });
  });

  it("matches folder names regardless of case", () => {
    mkdir("drive/users/carol/appdata");
    assert.deepStrictEqual(
      readWindowsInstall(path.join(root, "drive"))?.userProfiles,
      ["carol"]
    );
  });

  it("rejects folders that are not Windows drives", () => {
    mkdir("data/Games");
    assert.strictEqual(readWindowsInstall(path.join(root, "data")), null);
  });
});

describe("buildWindowsInstallMirror", () => {
  it("lays the install out like a Wine prefix", async () => {
    mkdir("drive/Users/alice/AppData/Roaming/Game");
    mkdir("drive/Users/Public/Documents/OnlineFix");
    mkdir("drive/ProgramData/Game");
    fs.writeFileSync(
      path.join(root, "drive/Users/alice/AppData/Roaming/Game/save.dat"),
      "save"
    );

    const mirror = await buildWindowsInstallMirror(
      { rootPath: path.join(root, "drive") },
      "alice",
      "linuxuser",
      path.join(root, "mirror")
    );

    const read = (relative: string) =>
      fs.readFileSync(path.join(mirror, relative), "utf8");
    assert.strictEqual(
      read("drive_c/users/linuxuser/AppData/Roaming/Game/save.dat"),
      "save"
    );
    assert.ok(
      fs.existsSync(
        path.join(mirror, "drive_c/users/Public/Documents/OnlineFix")
      )
    );
    assert.ok(fs.existsSync(path.join(mirror, "drive_c/ProgramData/Game")));
    assert.ok(!fs.existsSync(path.join(mirror, "drive_c/Program Files")));
  });
});
