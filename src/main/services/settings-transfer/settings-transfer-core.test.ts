import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { UserPreferences } from "@types";

import {
  buildSettingsFile,
  readSettingsFile,
} from "./settings-transfer-core.ts";

const preferences: UserPreferences = {
  downloadsPath: "/home/moonlight/Games",
  libraryScanDirectories: ["/home/moonlight/Games", "/mnt/Storage/Games"],
  defaultProtonPath: "/usr/share/steam/compatibilitytools.d/proton-cachyos-slr",
  floppyApiToken: "secret-token",
  steamHistoryApiKey: "secret-key",
  steamHistorySteamId: "76561198196098242",
  torrentNetworkInterface: "enp6s0",
  autoRunGamemode: true,
  launchRules: [],
};

describe("settings transfer", () => {
  const now = new Date("2026-10-31T12:00:00Z");

  it("writes the home folder as ~ and leaves secrets out", () => {
    const file = buildSettingsFile(preferences, {
      homePath: "/home/moonlight",
      includeSecrets: false,
      now,
    });
    assert.equal(file.preferences.downloadsPath, "~/Games");
    assert.deepEqual(file.preferences.libraryScanDirectories, [
      "~/Games",
      "/mnt/Storage/Games",
    ]);
    assert.equal(file.preferences.floppyApiToken, undefined);
    assert.equal(file.preferences.steamHistoryApiKey, undefined);
    assert.equal(file.preferences.steamHistorySteamId, "76561198196098242");
    assert.equal(file.preferences.torrentNetworkInterface, undefined);
    assert.equal(file.includesSecrets, false);
  });

  it("keeps secrets when asked", () => {
    const file = buildSettingsFile(preferences, {
      homePath: "/home/moonlight",
      includeSecrets: true,
      now,
    });
    assert.equal(file.preferences.floppyApiToken, "secret-token");
  });

  it("reads the paths back into another home folder", () => {
    const file = buildSettingsFile(preferences, {
      homePath: "/home/moonlight",
      includeSecrets: false,
      now,
    });
    const imported = readSettingsFile(JSON.stringify(file), {
      homePath: "/home/ari",
    });
    assert.equal(imported.downloadsPath, "/home/ari/Games");
    assert.equal(imported.autoRunGamemode, true);
    assert.equal(
      imported.defaultProtonPath,
      "/usr/share/steam/compatibilitytools.d/proton-cachyos-slr"
    );
  });

  it("refuses a file that is not a settings file", () => {
    assert.throws(
      () => readSettingsFile('{"a":1}', { homePath: "/home/ari" }),
      /not_a_settings_file/
    );
  });
});
