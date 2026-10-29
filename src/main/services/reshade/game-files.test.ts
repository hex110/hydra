import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyReShadeIniOverrides } from "./game-files.ts";

const OVERLAY_KEY = [
  { section: "INPUT", key: "KeyOverlay", value: "121,0,0,0" },
];

let root: string;

const read = (name: string) => fs.readFileSync(path.join(root, name), "utf8");

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "hydra-reshade-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("applyReShadeIniOverrides", () => {
  it("leaves a game without ReShade.ini alone", async () => {
    assert.strictEqual(
      await applyReShadeIniOverrides(root, OVERLAY_KEY),
      "missing"
    );
    assert.deepStrictEqual(fs.readdirSync(root), []);
  });

  it("replaces the overlay key and keeps the rest of the file", async () => {
    fs.writeFileSync(
      path.join(root, "ReShade.ini"),
      "[GENERAL]\nPresetPath=.\\p.ini\n\n[INPUT]\nKeyOverlay=36,0,0,0\nKeyReload=0,0,0,0\n"
    );

    assert.strictEqual(
      await applyReShadeIniOverrides(root, OVERLAY_KEY),
      "updated"
    );
    assert.strictEqual(
      read("ReShade.ini"),
      "[GENERAL]\nPresetPath=.\\p.ini\n\n[INPUT]\nKeyOverlay=121,0,0,0\nKeyReload=0,0,0,0\n"
    );
  });

  it("finds the file whatever its case", async () => {
    fs.writeFileSync(path.join(root, "reshade.ini"), "[GENERAL]\n");

    assert.strictEqual(
      await applyReShadeIniOverrides(root, OVERLAY_KEY),
      "updated"
    );
    assert.ok(read("reshade.ini").includes("KeyOverlay=121,0,0,0"));
  });

  it("reports unchanged when the key is already set", async () => {
    fs.writeFileSync(
      path.join(root, "ReShade.ini"),
      "[INPUT]\nKeyOverlay=121,0,0,0\n"
    );

    assert.strictEqual(
      await applyReShadeIniOverrides(root, OVERLAY_KEY),
      "unchanged"
    );
  });
});
