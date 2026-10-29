import { describe, it } from "node:test";
import assert from "node:assert";
import {
  RESHADE_SEED_INI,
  buildReShadeIni,
  resolveReShadeIniOverrides,
} from "./reshade.js";

describe("resolveReShadeIniOverrides", () => {
  it("moves the overlay key to F10 unless a setting says otherwise", () => {
    assert.deepStrictEqual(resolveReShadeIniOverrides(null), [
      { section: "INPUT", key: "KeyOverlay", value: "121,0,0,0" },
    ]);
  });

  it("uses the user's fragment instead of the default", () => {
    const overrides = resolveReShadeIniOverrides({
      reShadeIniOverrides: "[INPUT]\nKeyOverlay=123,0,0,0",
    });
    assert.deepStrictEqual(overrides, [
      { section: "INPUT", key: "KeyOverlay", value: "123,0,0,0" },
    ]);
  });

  it("applies nothing when the setting is empty", () => {
    assert.deepStrictEqual(
      resolveReShadeIniOverrides({ reShadeIniOverrides: "" }),
      []
    );
  });
});

describe("buildReShadeIni", () => {
  const overrides = resolveReShadeIniOverrides(null);

  it("seeds a new file and applies the overrides", () => {
    const ini = buildReShadeIni(null, overrides);
    assert.ok(ini.startsWith(RESHADE_SEED_INI.trimEnd()));
    assert.ok(ini.includes("TutorialProgress=4"));
    assert.ok(ini.includes("[INPUT]\r\nKeyOverlay=121,0,0,0"));
  });

  it("keeps the line endings of the seed", () => {
    assert.ok(!/[^\r]\n/.test(buildReShadeIni(null, overrides)));
  });

  it("changes only the overridden keys of an existing file", () => {
    const existing =
      "[GENERAL]\nPresetPath=mine.ini\n[INPUT]\nKeyOverlay=36,0,0,0\n";
    assert.strictEqual(
      buildReShadeIni(existing, overrides),
      "[GENERAL]\nPresetPath=mine.ini\n[INPUT]\nKeyOverlay=121,0,0,0\n"
    );
  });
});
