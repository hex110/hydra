import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  listSteamLaunchOptions,
  type SteamAppInfo,
  type SteamLaunchEntry,
} from "./steam-app-info-core.ts";
import { buildSteamLaunchEntryOptions } from "./steam-launch-options-core.ts";

const appInfo = (entries: Partial<SteamLaunchEntry>[]): SteamAppInfo => ({
  appId: "1",
  type: "game",
  name: "Game",
  branches: [],
  launch: entries.map((entry, index) => ({
    key: String(index),
    executable: `game${index}.exe`,
    description: null,
    arguments: null,
    type: null,
    oslist: [],
    osarch: null,
    betakey: null,
    ...entry,
  })),
});

describe("listSteamLaunchOptions", () => {
  it("lists one entry per operating system as a single option", () => {
    const options = listSteamLaunchOptions(
      appInfo([
        { executable: "g.exe", oslist: ["windows"] },
        { executable: "g.app", oslist: ["macos"] },
        { executable: "g", oslist: ["linux"] },
      ]),
      null,
      "linux",
      "x64"
    );

    assert.deepEqual(
      options.map((option) => option.executable),
      ["g"]
    );
  });

  it("keeps alternative launch entries, default first", () => {
    const options = listSteamLaunchOptions(
      appInfo([
        {
          executable: "vr.sh",
          type: "option1",
          description: "Play in VR",
          oslist: ["linux"],
        },
        {
          executable: "play.sh",
          type: "default",
          description: "Play",
          oslist: ["linux"],
        },
        { executable: "editor.sh", type: "editor", oslist: ["linux"] },
        { executable: "play.exe", type: "default", oslist: ["windows"] },
      ]),
      null,
      "linux",
      "x64"
    );

    assert.deepEqual(
      options.map((option) => [option.id, option.isDefault]),
      [
        ["1", true],
        ["0", false],
      ]
    );
  });

  it("uses the Windows entries when the game has no Linux build", () => {
    const options = listSteamLaunchOptions(
      appInfo([
        { executable: "a.exe", type: "default", oslist: ["windows"] },
        {
          executable: "b.exe",
          type: "option1",
          description: "DX12",
          oslist: ["windows"],
        },
        { executable: "a.app", oslist: ["macos"] },
      ]),
      null,
      "linux",
      "x64"
    );

    assert.deepEqual(
      options.map((option) => option.executable),
      ["a.exe", "b.exe"]
    );
  });

  it("drops entries for other branches and 32-bit twins", () => {
    const entries = appInfo([
      { executable: "g64.exe", osarch: "64", oslist: ["windows"] },
      { executable: "g32.exe", osarch: "32", oslist: ["windows"] },
      { executable: "beta.exe", betakey: "beta", oslist: ["windows"] },
    ]);

    assert.equal(
      listSteamLaunchOptions(entries, null, "win32", "x64").length,
      1
    );
    assert.deepEqual(
      listSteamLaunchOptions(entries, "beta", "win32", "x64").map(
        (option) => option.executable
      ),
      ["g64.exe", "beta.exe"]
    );
  });

  it("does not list the same command twice", () => {
    const options = listSteamLaunchOptions(
      appInfo([
        { executable: "Game.exe", oslist: ["windows"] },
        { executable: "game.exe", oslist: ["windows"] },
      ]),
      null,
      "win32",
      "x64"
    );

    assert.equal(options.length, 1);
  });
});

describe("buildSteamLaunchEntryOptions", () => {
  it("adds the Steamworks variables and the entry's arguments", () => {
    assert.equal(
      buildSteamLaunchEntryOptions("620", "-vr -windowed", null),
      "SteamAppId=620 SteamGameId=620 %command% -vr -windowed"
    );
  });

  it("keeps the player's options after the entry's arguments", () => {
    assert.equal(
      buildSteamLaunchEntryOptions("620", "-vr", "-novid"),
      "SteamAppId=620 SteamGameId=620 %command% -vr -novid"
    );
    assert.equal(
      buildSteamLaunchEntryOptions("620", "-vr", "FOO=1 %command% -novid"),
      "SteamAppId=620 SteamGameId=620 FOO=1 %command% -vr -novid"
    );
  });

  it("works for an entry without arguments", () => {
    assert.equal(
      buildSteamLaunchEntryOptions("620", null, "gamemoderun %command%"),
      "SteamAppId=620 SteamGameId=620 gamemoderun %command%"
    );
  });
});
