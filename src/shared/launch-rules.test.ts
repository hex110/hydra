import { describe, it } from "node:test";
import assert from "node:assert";
import { LAUNCH_RULE_PRESETS, isLaunchRuleApplied } from "./launch-rules.js";

describe("LAUNCH_RULE_PRESETS", () => {
  it("has unique ids and preset ids", () => {
    const ids = LAUNCH_RULE_PRESETS.map((rule) => rule.id);
    const presetIds = LAUNCH_RULE_PRESETS.map((rule) => rule.presetId);
    assert.strictEqual(new Set(ids).size, ids.length);
    assert.strictEqual(new Set(presetIds).size, presetIds.length);
  });

  it("offers the Hyprland HDR switch for every game, off until a game turns it on", () => {
    const rule = LAUNCH_RULE_PRESETS.find(
      (item) => item.presetId === "hyprland-hdr"
    );
    assert.ok(rule);
    assert.strictEqual(rule.matchAllGames, true);
    assert.strictEqual(rule.launchOptions, "hypr-hdr %command%");
    assert.strictEqual(isLaunchRuleApplied(rule, null), false);
    assert.strictEqual(isLaunchRuleApplied(rule, { [rule.id]: true }), true);
  });
});
