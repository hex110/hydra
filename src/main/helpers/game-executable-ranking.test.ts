import { describe, it } from "node:test";
import assert from "node:assert";
import {
  isNonGameDirectory,
  isRedistributablePath,
} from "./game-executable-ranking.ts";

describe("isNonGameDirectory", () => {
  it("skips Wine's own libraries inside a Proton install", () => {
    assert.strictEqual(
      isNonGameDirectory(
        "/mnt/Storage/SteamLibrary/steamapps/common/Proton 11.0/files/lib/wine"
      ),
      true
    );
    assert.strictEqual(
      isNonGameDirectory("/opt/wine/lib64/wine/i386-windows"),
      false
    );
    assert.strictEqual(isNonGameDirectory("/opt/wine/lib64/wine"), true);
  });

  it("skips Proton installs and Steam tools under steamapps/common", () => {
    const common = "/games/SteamLibrary/steamapps/common";

    for (const name of [
      "Proton 11.0",
      "Proton - Experimental",
      "Proton Hotfix",
      "Proton-GE-9",
      "Spacewar",
      "SteamLinuxRuntime_sniper",
      "Steam Linux Runtime 3.0 (sniper)",
      "Steamworks Common Redistributables",
    ]) {
      assert.strictEqual(isNonGameDirectory(`${common}/${name}`), true, name);
    }
  });

  it("skips custom Proton builds and Wine prefix system folders", () => {
    assert.strictEqual(
      isNonGameDirectory(
        "/home/a/.local/share/Steam/compatibilitytools.d/GE-Proton9-1"
      ),
      true
    );
    assert.strictEqual(
      isNonGameDirectory("/home/a/Prefixes/x/drive_c/windows"),
      true
    );
  });

  it("keeps real games, even ones named like a tool", () => {
    const common = "/games/SteamLibrary/steamapps/common";

    for (const name of ["Proton Pulse", "Dragon Ball Xenoverse 2", "Hades"]) {
      assert.strictEqual(isNonGameDirectory(`${common}/${name}`), false, name);
    }
    assert.strictEqual(isNonGameDirectory("/games/Spacewar"), false);
  });
});

describe("isRedistributablePath", () => {
  it("treats a generic Update.exe as not a game", () => {
    assert.strictEqual(isRedistributablePath("Update/Update.exe"), true);
  });
});
