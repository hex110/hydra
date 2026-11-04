import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { InstalledMod, ModActivityEntry } from "../types/mods.types.js";
import { describeModLayout, planModFiles } from "./mods.js";
import {
  MOD_REPORT_ACTIVITY_LINES,
  buildRunMods,
  formatModActivityLine,
  formatModReport,
  formatRunModsSection,
  type ModReportInput,
} from "./mods-report.js";

const mod = (overrides: Partial<InstalledMod>): InstalledMod => ({
  id: "a",
  name: "Content Patcher",
  version: "2.0.0",
  source: {
    kind: "nexus",
    gameDomain: "stardewvalley",
    gameId: 1303,
    modId: 1915,
    fileId: 100,
  },
  enabled: true,
  deployRoot: "Mods",
  files: ["ContentPatcher/manifest.json", "ContentPatcher/ContentPatcher.dll"],
  installedAt: 0,
  ...overrides,
});

const baseInput = (
  overrides: Partial<ModReportInput> = {}
): ModReportInput => ({
  generatedAt: "2026-11-04T10:00:00.000Z",
  game: {
    title: "Stardew Valley",
    shop: "steam",
    objectId: "413150",
    executablePath: "/games/Stardew Valley/Stardew Valley.exe",
    protonPath: null,
    winePrefixPath: null,
  },
  gameFolder: "/games/Stardew Valley",
  storeFolder: "/data/mods/steam/413150",
  support: { kind: "fallback", modFolder: "Mods", source: "mod-folder-table" },
  nexusGame: { id: 1303, domainName: "stardewvalley", name: "Stardew Valley" },
  profileName: null,
  playMode: "modded",
  loader: null,
  mods: [mod({}), mod({ id: "b", name: "Lookup Anything", enabled: false })],
  overridden: { a: ["Mods/ContentPatcher/manifest.json"] },
  deployed: { files: 2, linked: 2, copied: 0, backedUp: 0 },
  lastRun: null,
  loaderErrors: [],
  activity: [],
  ...overrides,
});

describe("buildRunMods", () => {
  it("lists only the mods that are on, in order", () => {
    const run = buildRunMods(
      [mod({}), mod({ id: "b", name: "Off", enabled: false })],
      "modded",
      null
    );
    assert.deepEqual(run, {
      modded: true,
      loader: null,
      mods: [
        {
          name: "Content Patcher",
          version: "2.0.0",
          source: "Nexus Mods stardewvalley/mods/1915 file 100",
        },
      ],
    });
  });

  it("records nothing for a game without mods on", () => {
    assert.equal(buildRunMods([mod({ enabled: false })], "modded", null), null);
  });

  it("drops the loader for a plain launch", () => {
    const run = buildRunMods([mod({})], "plain", {
      name: "SMAPI",
      version: "4.1",
    });
    assert.equal(run?.modded, false);
    assert.equal(run?.loader, null);
  });
});

describe("formatRunModsSection", () => {
  it("says how the run started and what was on", () => {
    const text = formatRunModsSection(
      buildRunMods([mod({})], "modded", null)
    ).join("\n");
    assert.match(text, /## Mods/);
    assert.match(text, /Play \(modded\)/);
    assert.match(text, /Content Patcher 2\.0\.0/);
  });

  it("adds nothing to runs without mods", () => {
    assert.deepEqual(formatRunModsSection(null), []);
  });
});

describe("formatModReport", () => {
  it("covers the game, support, list, deploy state and run", () => {
    const report = formatModReport(baseInput());
    assert.match(report, /# Mods report: Stardew Valley/);
    assert.match(report, /steam\/413150/);
    assert.match(report, /Hydra places files in Mods/);
    assert.match(report, /1\. Content Patcher: on, version 2\.0\.0/);
    assert.match(report, /1 file replaced by mods below it/);
    assert.match(report, /2\. Lookup Anything: off/);
    assert.match(
      report,
      /2 files in the game folder \(2 hard links, 0 copies\)/
    );
    assert.match(report, /has not been started from Hydra yet/);
    assert.match(report, /No loader, so no loader log/);
  });

  it("keeps the newest activity lines only", () => {
    const activity: ModActivityEntry[] = Array.from(
      { length: MOD_REPORT_ACTIVITY_LINES + 5 },
      (_, index) => ({
        at: `2026-11-04T10:00:${String(index % 60).padStart(2, "0")}Z`,
        kind: "deploy",
        message: `entry ${index}`,
      })
    );
    const report = formatModReport(baseInput({ activity }));
    assert.doesNotMatch(report, /entry 4\b/);
    assert.match(report, /entry 5\b/);
    assert.match(report, new RegExp(`last ${MOD_REPORT_ACTIVITY_LINES}`));
  });
});

describe("formatModActivityLine", () => {
  it("puts the kind, mod and details on one line", () => {
    assert.equal(
      formatModActivityLine({
        at: "2026-11-04T10:00:00Z",
        kind: "enabled",
        modName: "Content Patcher",
        message: "Turned on.",
        details: { order: 1 },
      }),
      '2026-11-04T10:00:00Z [enabled] (Content Patcher) Turned on. {"order":1}'
    );
  });
});

describe("planModFiles", () => {
  it("strips a wrapper folder and adds the deploy root", () => {
    assert.deepEqual(
      planModFiles(["Wrapper/meshes/a.nif"], {
        stripPrefix: "Wrapper",
        deployRoot: "Data",
      }),
      [{ archive: "Wrapper/meshes/a.nif", target: "Data/meshes/a.nif" }]
    );
  });

  it("explains each layout", () => {
    assert.match(
      describeModLayout({ stripPrefix: "", deployRoot: "" }, "Mods"),
      /mirrors the game folder/
    );
    assert.match(
      describeModLayout({ stripPrefix: "", deployRoot: "Mods" }, "Mods"),
      /mod folder Mods/
    );
  });
});
