import { describe, it } from "node:test";
import assert from "node:assert";
import { resolveReShadeIniOverrides } from "./reshade.js";

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
