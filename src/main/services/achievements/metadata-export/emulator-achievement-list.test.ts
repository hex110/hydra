import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  mergeEmulatorAchievementList,
  parseSteamEmuIni,
} from "./emulator-achievement-list.ts";

const crlf = (lines: string[]) => lines.join("\r\n") + "\r\n";

const locked = (name: string) => [
  `[${name}]`,
  "Achieved=0",
  "CurProgress=0",
  "MaxProgress=0",
  "UnlockTime=0",
  "",
];

describe("mergeEmulatorAchievementList", () => {
  it("seeds every achievement into an empty file", () => {
    assert.equal(
      mergeEmulatorAchievementList("[SteamAchievements]\r\nCount=0\r\n\r\n", [
        "Thrashed",
        "ConeIslandBaby",
      ]),
      crlf([
        "[SteamAchievements]",
        "00000=Thrashed",
        "00001=ConeIslandBaby",
        "Count=2",
        "",
        ...locked("Thrashed"),
        ...locked("ConeIslandBaby"),
      ])
    );
  });

  it("seeds a file that does not exist yet", () => {
    assert.equal(
      mergeEmulatorAchievementList(null, ["One"]),
      crlf([
        "[SteamAchievements]",
        "00000=One",
        "Count=1",
        "",
        ...locked("One"),
      ])
    );
  });

  it("keeps unlocked achievements verbatim and appends the missing ones", () => {
    const existing = crlf([
      "[SteamAchievements]",
      "00000=Thrashed",
      "Count=1",
      "",
      "[Thrashed]",
      "Achieved=1",
      "CurProgress=0",
      "MaxProgress=0",
      "UnlockTime=1795084561",
      "",
    ]);

    assert.equal(
      mergeEmulatorAchievementList(existing, ["ConeIslandBaby", "Thrashed"]),
      crlf([
        "[SteamAchievements]",
        "00000=Thrashed",
        "00001=ConeIslandBaby",
        "Count=2",
        "",
        "[Thrashed]",
        "Achieved=1",
        "CurProgress=0",
        "MaxProgress=0",
        "UnlockTime=1795084561",
        "",
        ...locked("ConeIslandBaby"),
      ])
    );
  });

  it("returns null when the file already lists every achievement", () => {
    const existing = crlf([
      "[SteamAchievements]",
      "00000=One",
      "Count=1",
      "",
      ...locked("One"),
    ]);

    assert.equal(mergeEmulatorAchievementList(existing, ["One"]), null);
  });

  it("returns null when there are no achievement names", () => {
    assert.equal(mergeEmulatorAchievementList(null, []), null);
    assert.equal(mergeEmulatorAchievementList("", [""]), null);
  });

  it("ignores duplicate and empty names", () => {
    assert.equal(
      mergeEmulatorAchievementList(null, ["One", "", "One", "Two"]),
      crlf([
        "[SteamAchievements]",
        "00000=One",
        "00001=Two",
        "Count=2",
        "",
        ...locked("One"),
        ...locked("Two"),
      ])
    );
  });

  it("accepts LF line endings and writes CRLF", () => {
    const existing =
      "[SteamAchievements]\n00000=One\nCount=1\n\n[One]\nAchieved=1\nCurProgress=0\nMaxProgress=0\nUnlockTime=5\n\n";

    assert.equal(
      mergeEmulatorAchievementList(existing, ["One", "Two"]),
      crlf([
        "[SteamAchievements]",
        "00000=One",
        "00001=Two",
        "Count=2",
        "",
        "[One]",
        "Achieved=1",
        "CurProgress=0",
        "MaxProgress=0",
        "UnlockTime=5",
        "",
        ...locked("Two"),
      ])
    );
  });
});

describe("parseSteamEmuIni", () => {
  it("reads the RUNE banner and the app id", () => {
    const contents = crlf([
      "###      = dS!\\/- -\\_______\\ =-RUNE- -== \\/ ==-\\______\\-= ======== --\\__\\ ",
      "###",
      "### Game data is stored at %SystemDrive%\\Users\\Public\\Documents\\Steam\\RUNE\\2582320",
      "###",
      "[Settings]",
      "###",
      "### Game identifier (http://store.steampowered.com/app/2582320)",
      "###",
      "AppId=2582320",
      "UserName=AnkerGames",
    ]);

    assert.deepEqual(parseSteamEmuIni(contents, []), {
      kind: "RUNE",
      appId: "2582320",
    });
  });

  it("reads the CODEX banner", () => {
    assert.deepEqual(
      parseSteamEmuIni(
        "### stored at %SystemDrive%\\Users\\Public\\Documents\\Steam\\CODEX\\10\n[Settings]\nappid=10\n",
        []
      ),
      { kind: "CODEX", appId: "10" }
    );
  });

  it("falls back to a .rne or .cdx sibling file", () => {
    assert.deepEqual(
      parseSteamEmuIni("[Settings]\nAppId=5\n", [
        "steam_api64.dll",
        "STEAM_API64.RNE",
      ]),
      { kind: "RUNE", appId: "5" }
    );

    assert.deepEqual(parseSteamEmuIni("[Settings]\n", ["steam_api64.cdx"]), {
      kind: "CODEX",
      appId: null,
    });
  });

  it("ignores a commented-out app id and non-numeric values", () => {
    assert.deepEqual(
      parseSteamEmuIni("[Settings]\n# AppId=1\n; AppId=2\n", ["a.rne"]),
      { kind: "RUNE", appId: null }
    );

    assert.deepEqual(parseSteamEmuIni("[Settings]\nAppId=abc\n", ["a.rne"]), {
      kind: "RUNE",
      appId: null,
    });
  });

  it("ignores an app id outside the Settings section", () => {
    assert.deepEqual(parseSteamEmuIni("[Other]\nAppId=7\n", ["a.cdx"]), {
      kind: "CODEX",
      appId: null,
    });
  });

  it("returns null when nothing marks a RUNE or CODEX emulator", () => {
    assert.equal(
      parseSteamEmuIni("[Settings]\nAppId=1\n", ["steam_api64.dll"]),
      null
    );
  });
});
