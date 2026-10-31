import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  doesSteamCompatDataPathMatchWinePrefix,
  isLinuxGameWindowProcess,
  isPlausibleGameProcessPath,
} from "./linux-process-match.js";

describe("Steam compatibility prefix matching", () => {
  it("matches both compatibility roots and their pfx directories", () => {
    assert.equal(
      doesSteamCompatDataPathMatchWinePrefix(
        "/games/compatdata/620",
        "/games/compatdata/620/pfx"
      ),
      true
    );
    assert.equal(
      doesSteamCompatDataPathMatchWinePrefix(
        "/games/compatdata/730",
        "/games/compatdata/620/pfx"
      ),
      false
    );
  });
});

describe("Linux game window process matching", () => {
  it("accepts a descendant of the process launched by Hydra", () => {
    assert.equal(
      isLinuxGameWindowProcess(
        [
          { pid: 10, parentPid: null, exe: "/usr/bin/wrapper", cwd: "/tmp" },
          { pid: 20, parentPid: 10, exe: "/games/game", cwd: "/games" },
        ],
        20,
        10,
        []
      ),
      true
    );
  });

  it("accepts a process that references the configured executable", () => {
    assert.equal(
      isLinuxGameWindowProcess(
        [{ pid: 20, exe: "/games/game", cwd: "/games" }],
        20,
        undefined,
        ["/games/game"]
      ),
      true
    );
  });

  it("accepts a Wine process from the configured compatibility prefix", () => {
    assert.equal(
      isLinuxGameWindowProcess(
        [
          {
            pid: 20,
            exe: "/usr/bin/wine64-preloader",
            cwd: "/tmp",
            environ: { STEAM_COMPAT_DATA_PATH: "/games/prefix" },
          },
        ],
        20,
        undefined,
        ["/games/game.exe"],
        "/games/prefix"
      ),
      true
    );
  });

  it("accepts a Proton process whose compatibility data contains the prefix", () => {
    assert.equal(
      isLinuxGameWindowProcess(
        [
          {
            pid: 20,
            exe: "/usr/bin/wine64-preloader",
            cwd: "/tmp",
            environ: { STEAM_COMPAT_DATA_PATH: "/games/compatdata/10" },
          },
        ],
        20,
        undefined,
        ["/games/game.exe"],
        "/games/compatdata/10/pfx"
      ),
      true
    );
  });

  it("rejects an unrelated active process", () => {
    assert.equal(
      isLinuxGameWindowProcess(
        [{ pid: 20, exe: "/usr/bin/browser", cwd: "/home/user" }],
        20,
        10,
        ["/games/game"]
      ),
      false
    );
  });
});

describe("isPlausibleGameProcessPath", () => {
  it("refuses shells, interpreters and system folders", () => {
    assert.equal(isPlausibleGameProcessPath("/floppy/sh"), false);
    assert.equal(isPlausibleGameProcessPath("/usr/bin/python3"), false);
    assert.equal(isPlausibleGameProcessPath("/usr/lib/game/thing"), false);
  });

  it("accepts game executables", () => {
    assert.equal(
      isPlausibleGameProcessPath(
        "/mnt/Storage/SteamLibrary/steamapps/common/Factorio/bin/x64/factorio"
      ),
      true
    );
    assert.equal(
      isPlausibleGameProcessPath("/home/me/Games/Hades/x64/Hades.exe"),
      true
    );
  });
});
