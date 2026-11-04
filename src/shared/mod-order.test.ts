import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { InstalledMod } from "../types/mods.types.js";
import {
  parseModManifest,
  parseRimWorldAbout,
  sortModsByDependencies,
  withRecordedDependencies,
  type ModDependencyInfo,
} from "./mod-order.js";

const mod = (
  modId: string,
  overrides: Partial<InstalledMod> = {}
): InstalledMod => ({
  id: modId,
  name: modId,
  version: null,
  source: { kind: "file", fileName: `${modId}.zip` },
  enabled: true,
  deployRoot: "",
  files: [],
  installedAt: 0,
  ...overrides,
});

describe("parseModManifest", () => {
  it("reads a SMAPI manifest with comments and trailing commas", () => {
    const info = parseModManifest(`{
      // a comment
      "Name": "Better Crafting",
      "UniqueID": "leclair.bettercrafting",
      "Dependencies": [
        { "UniqueID": "spacechase0.SpaceCore", },
        { "UniqueID": "Optional.Mod", "IsRequired": false },
      ],
    }`);
    assert.deepEqual(info, {
      provides: ["smapi:leclair.bettercrafting"],
      after: [
        {
          id: "smapi:spacechase0.spacecore",
          source: "its manifest.json Dependencies",
        },
      ],
      before: [],
    });
  });

  it("reads a content pack's parent", () => {
    const info = parseModManifest(
      '{"UniqueID":"me.pack","ContentPackFor":{"UniqueID":"Pathoschild.ContentPatcher"}}'
    );
    assert.equal(info?.after[0].id, "smapi:pathoschild.contentpatcher");
  });

  it("reads a Thunderstore manifest", () => {
    const info = parseModManifest(
      '{"name":"Jotunn","version_number":"2.20.0","dependencies":["denikson-BepInExPack_Valheim-5.4.2202"]}'
    );
    assert.deepEqual(info?.provides, ["thunderstore:jotunn"]);
    assert.equal(info?.after[0].id, "thunderstore:bepinexpack_valheim");
  });

  it("ignores other JSON", () => {
    assert.equal(parseModManifest('{"settings": true}'), null);
    assert.equal(parseModManifest("not json"), null);
  });
});

describe("parseRimWorldAbout", () => {
  it("reads packageId, dependencies and load hints", () => {
    const info = parseRimWorldAbout(`<ModMetaData>
      <name>Vanilla Expanded</name>
      <packageId>OskarPotocki.VanillaFactionsExpanded.Core</packageId>
      <modDependencies>
        <li><packageId>brrainz.harmony</packageId><displayName>Harmony</displayName></li>
      </modDependencies>
      <loadAfter><li>Ludeon.RimWorld</li></loadAfter>
      <loadBefore><li>Some.Patch</li></loadBefore>
    </ModMetaData>`);
    assert.deepEqual(info?.provides, [
      "rimworld:oskarpotocki.vanillafactionsexpanded.core",
    ]);
    assert.deepEqual(
      info?.after.map((item) => item.id),
      ["rimworld:brrainz.harmony", "rimworld:ludeon.rimworld"]
    );
    assert.deepEqual(
      info?.before.map((item) => item.id),
      ["rimworld:some.patch"]
    );
  });
});

describe("sortModsByDependencies", () => {
  const info = (partial: Partial<ModDependencyInfo>): ModDependencyInfo => ({
    provides: [],
    after: [],
    before: [],
    ...partial,
  });

  it("moves a dependency before the mod that needs it and nothing else", () => {
    const mods = [mod("a"), mod("pack"), mod("b"), mod("core")];
    const proposal = sortModsByDependencies(
      mods,
      new Map([
        ["core", info({ provides: ["smapi:core"] })],
        [
          "pack",
          info({
            after: [{ id: "smapi:core", source: "its manifest.json" }],
          }),
        ],
      ])
    );
    assert.deepEqual(proposal.order, ["a", "b", "core", "pack"]);
    assert.deepEqual(proposal.changes, [
      { modName: "core", beforeName: "pack", reason: "its manifest.json" },
    ]);
    assert.equal(proposal.unchanged, false);
  });

  it("uses Nexus requirements and the loader", () => {
    const loader = mod("bepinex", {
      loader: { kind: "bepinex", nativeDlls: ["winhttp"] },
    });
    const lib = mod("lib", {
      source: {
        kind: "nexus",
        gameDomain: "g",
        gameId: 1,
        modId: 7,
        fileId: 1,
      },
    });
    const plugin = mod("plugin", {
      needsLoader: "bepinex",
      requirements: [{ modId: 7, name: "lib", url: null, notes: null }],
    });
    const mods = [plugin, lib, loader];
    const infos = new Map(
      mods.map((item) => [item.id, withRecordedDependencies(item, info({}))])
    );
    assert.deepEqual(sortModsByDependencies(mods, infos).order, [
      "lib",
      "bepinex",
      "plugin",
    ]);
  });

  it("says when the order is already right", () => {
    const proposal = sortModsByDependencies(
      [mod("core"), mod("pack")],
      new Map([
        ["core", info({ provides: ["x"] })],
        ["pack", info({ after: [{ id: "x", source: "s" }] })],
      ])
    );
    assert.equal(proposal.unchanged, true);
    assert.deepEqual(proposal.changes, []);
  });

  it("reports a cycle and keeps those mods in order", () => {
    const proposal = sortModsByDependencies(
      [mod("a"), mod("b")],
      new Map([
        ["a", info({ provides: ["a"], after: [{ id: "b", source: "s" }] })],
        ["b", info({ provides: ["b"], after: [{ id: "a", source: "s" }] })],
      ])
    );
    assert.deepEqual(proposal.order, ["a", "b"]);
    assert.deepEqual(proposal.cycles, [["a", "b"]]);
  });
});
