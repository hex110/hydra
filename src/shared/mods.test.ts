import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  findModUpdate,
  isFomodArchive,
  parseNxmLink,
  planDeployment,
  resolveModLayout,
} from "./mods.js";

const layout = (files: string[], modFolder: string, gameRoot: string[] = []) =>
  resolveModLayout({
    files,
    modFolder,
    gameRootEntries: new Set(gameRoot.map((entry) => entry.toLowerCase())),
  });

describe("resolveModLayout", () => {
  it("puts a Stardew mod folder under Mods", () => {
    assert.deepEqual(
      layout(
        ["ContentPatcher/manifest.json", "ContentPatcher/ContentPatcher.dll"],
        "Mods"
      ),
      { stripPrefix: "", deployRoot: "Mods" }
    );
  });

  it("keeps an archive that already starts with the mod folder", () => {
    assert.deepEqual(layout(["mods/Foo/manifest.json"], "Mods"), {
      stripPrefix: "",
      deployRoot: "",
    });
  });

  it("drops a wrapper around a game-folder layout", () => {
    assert.deepEqual(
      layout(
        ["Cool Mod/archive/pc/mod/cool.archive", "Cool Mod/bin/x64/a.dll"],
        "",
        ["bin", "archive", "engine"]
      ),
      { stripPrefix: "Cool Mod", deployRoot: "" }
    );
  });

  it("keeps a Cyberpunk archive that mirrors the game folder", () => {
    assert.deepEqual(
      layout(["archive/pc/mod/cool.archive"], "", ["archive", "bin"]),
      { stripPrefix: "", deployRoot: "" }
    );
  });

  it("puts loose Data content into Data, dropping the mod's name folder", () => {
    assert.deepEqual(
      layout(["SkyUI/SkyUI_SE.esp", "SkyUI/interface/skyui.swf"], "Data"),
      { stripPrefix: "SkyUI", deployRoot: "Data" }
    );
    assert.deepEqual(layout(["SkyUI_SE.esp", "SkyUI_SE.bsa"], "Data"), {
      stripPrefix: "",
      deployRoot: "Data",
    });
  });
});

describe("planDeployment", () => {
  it("lets the later mod win a file both ship, case-insensitively", () => {
    const plan = planDeployment([
      {
        id: "a",
        enabled: true,
        deployRoot: "Data",
        files: ["textures/sky.dds", "a.esp"],
      },
      {
        id: "b",
        enabled: true,
        deployRoot: "data",
        files: ["Textures/Sky.dds"],
      },
      { id: "c", enabled: false, deployRoot: "Data", files: ["a.esp"] },
    ]);

    assert.equal(plan.files.get("data/textures/sky.dds")?.modId, "b");
    assert.equal(plan.files.get("data/a.esp")?.modId, "a");
    assert.deepEqual(plan.overridden, { a: ["Data/textures/sky.dds"] });
  });
});

describe("isFomodArchive", () => {
  it("finds a FOMOD installer at any depth", () => {
    assert.equal(isFomodArchive(["Mod/fomod/ModuleConfig.xml"]), true);
    assert.equal(isFomodArchive(["Mod/readme.txt"]), false);
  });
});

describe("parseNxmLink", () => {
  it("reads Nexus's mod manager links", () => {
    assert.deepEqual(
      parseNxmLink(
        "nxm://stardewvalley/mods/1915/files/160463?key=abc&expires=1"
      ),
      { gameDomain: "stardewvalley", modId: 1915, fileId: 160463 }
    );
    assert.equal(parseNxmLink("https://nexusmods.com"), null);
  });
});

describe("findModUpdate", () => {
  const files = [
    { fileId: 1, category: "OLD_VERSION" as const, uploadedAt: 100 },
    { fileId: 2, category: "MAIN" as const, uploadedAt: 200 },
    { fileId: 3, category: "OPTIONAL" as const, uploadedAt: 300 },
  ];

  it("offers the newest main file", () => {
    assert.equal(findModUpdate(files, 1)?.fileId, 2);
  });

  it("has nothing when the newest main file is installed", () => {
    assert.equal(findModUpdate(files, 2), null);
  });

  it("doesn't offer an older main file for a newer optional one", () => {
    assert.equal(findModUpdate(files, 3), null);
  });
});
