import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyPlacementChoices,
  assessPlacement,
  choicesFromPlan,
  listPlacementEntries,
  nexusDescriptionToText,
} from "./mod-placement.js";

describe("listPlacementEntries", () => {
  it("counts files per top-level entry", () => {
    assert.deepEqual(
      listPlacementEntries(["Foo/a.pak", "Foo/b.pak", "readme.txt"]),
      [
        { name: "Foo", isFolder: true, files: 2 },
        { name: "readme.txt", isFolder: false, files: 1 },
      ]
    );
  });
});

describe("applyPlacementChoices", () => {
  const files = ["Foo/Content/x.pak", "readme.txt"];

  it("places a folder, its contents, or leaves it out", () => {
    assert.deepEqual(
      applyPlacementChoices(files, [
        { entry: "Foo", mode: "contents", target: "Game/Content/Paks/~mods" },
        { entry: "readme.txt", mode: "skip", target: "" },
      ]),
      [
        {
          archive: "Foo/Content/x.pak",
          target: "Game/Content/Paks/~mods/Content/x.pak",
        },
      ]
    );
    assert.deepEqual(
      applyPlacementChoices(files, [
        { entry: "Foo", mode: "folder", target: "" },
        { entry: "readme.txt", mode: "folder", target: "Docs" },
      ]).map((file) => file.target),
      ["Foo/Content/x.pak", "Docs/readme.txt"]
    );
  });
});

describe("choicesFromPlan", () => {
  it("turns a planned layout back into choices", () => {
    assert.deepEqual(
      choicesFromPlan([
        { archive: "Foo/a.dll", target: "BepInEx/plugins/Foo/a.dll" },
        { archive: "Wrap/inner/b.txt", target: "Mods/inner/b.txt" },
      ]),
      [
        { entry: "Foo", mode: "folder", target: "BepInEx/plugins" },
        { entry: "Wrap", mode: "contents", target: "Mods" },
      ]
    );
  });
});

describe("assessPlacement", () => {
  const root = new Set(["game.exe", "data", "readme.txt"]);

  it("asks about an archive with a program", () => {
    assert.deepEqual(
      assessPlacement({
        files: ["Setup.exe", "data/x.bin"],
        gameRootEntries: root,
        modFolder: "",
        plannedTargets: ["Setup.exe", "data/x.bin"],
        recognised: null,
      }),
      { reason: "contains-program", files: ["Setup.exe"] }
    );
  });

  it("asks when loose files match nothing in the game folder", () => {
    assert.equal(
      assessPlacement({
        files: ["MyMod/x.pak"],
        gameRootEntries: root,
        modFolder: "",
        plannedTargets: ["MyMod/x.pak"],
        recognised: null,
      })?.reason,
      "loose-in-game-folder"
    );
  });

  it("trusts a layout that matches the game folder", () => {
    assert.equal(
      assessPlacement({
        files: ["data/x.bin"],
        gameRootEntries: root,
        modFolder: "",
        plannedTargets: ["data/x.bin"],
        recognised: null,
      }),
      null
    );
  });

  it("trusts a game's mod folder and asks when a definition recognised nothing", () => {
    assert.equal(
      assessPlacement({
        files: ["Foo/manifest.json"],
        gameRootEntries: root,
        modFolder: "Mods",
        plannedTargets: ["Mods/Foo/manifest.json"],
        recognised: null,
      }),
      null
    );
    assert.equal(
      assessPlacement({
        files: ["x.pak"],
        gameRootEntries: root,
        modFolder: "BepInEx/plugins",
        plannedTargets: ["BepInEx/plugins/X/x.pak"],
        recognised: false,
      })?.reason,
      "nothing-recognised"
    );
  });
});

describe("nexusDescriptionToText", () => {
  it("turns BBCode and HTML into plain text", () => {
    assert.equal(
      nexusDescriptionToText(
        "[size=4][b]Install[/b][/size]<br />[list]<br />[*]Extract into the game folder[/*]<br />[/list]<br />See [url=https://x.y]the wiki[/url] &amp; enjoy"
      ),
      "Install\n\n• Extract into the game folder\n\nSee the wiki (https://x.y) & enjoy"
    );
  });
});
