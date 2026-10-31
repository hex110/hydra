import { describe, it } from "node:test";
import assert from "node:assert";
import type { Game } from "@types";
import {
  protonWaylandHdr,
  resolveRenoDxNeeds,
  withDependencyRuleOverrides,
} from "./game-dependencies.js";
import {
  HDR_LAUNCH_RULE_ID,
  HYPRLAND_HDR_LAUNCH_RULE_ID,
} from "./launch-rules.js";

const game = (fields: Partial<Game> = {}) => fields as Game;
const withRenoDx = { renoDx: {} } as Partial<Game>;

describe("protonWaylandHdr", () => {
  it("says no for umu's default and UMU-Proton 10", () => {
    assert.strictEqual(protonWaylandHdr(null), "no");
    assert.strictEqual(protonWaylandHdr("UMU-Proton-10-24"), "no");
  });

  it("says yes for GE-Proton 11 and later", () => {
    assert.strictEqual(protonWaylandHdr("GE-Proton11-11"), "yes");
    assert.strictEqual(protonWaylandHdr("GE-Proton12-1"), "yes");
  });

  it("does not claim builds that were not tested", () => {
    assert.strictEqual(protonWaylandHdr("GE-Proton10-9"), "unknown");
    assert.strictEqual(protonWaylandHdr("proton-cachyos-10.0"), "unknown");
    assert.strictEqual(protonWaylandHdr("UMU-Proton-11-1"), "unknown");
  });
});

describe("withDependencyRuleOverrides", () => {
  const on = { enableHdrRules: true, canSwitchMonitor: true };

  it("turns on both HDR rules for a game with RenoDX", () => {
    assert.deepStrictEqual(withDependencyRuleOverrides(game(withRenoDx), on), {
      [HDR_LAUNCH_RULE_ID]: true,
      [HYPRLAND_HDR_LAUNCH_RULE_ID]: true,
    });
  });

  it("leaves the monitor switch alone where it cannot be done", () => {
    assert.deepStrictEqual(
      withDependencyRuleOverrides(game(withRenoDx), {
        ...on,
        canSwitchMonitor: false,
      }),
      { [HDR_LAUNCH_RULE_ID]: true }
    );
  });

  it("keeps the game's own choice, including Off", () => {
    const overrides = { [HDR_LAUNCH_RULE_ID]: false };
    assert.deepStrictEqual(
      withDependencyRuleOverrides(
        game({ ...withRenoDx, launchRuleOverrides: overrides }),
        on
      ),
      { [HDR_LAUNCH_RULE_ID]: false, [HYPRLAND_HDR_LAUNCH_RULE_ID]: true }
    );
  });

  it("changes nothing without RenoDX or with the setting off", () => {
    assert.deepStrictEqual(withDependencyRuleOverrides(game(), on), {});
    assert.deepStrictEqual(
      withDependencyRuleOverrides(game(withRenoDx), {
        ...on,
        enableHdrRules: false,
      }),
      {}
    );
  });
});

describe("resolveRenoDxNeeds", () => {
  const base = {
    hdrActive: true,
    monitorActive: true,
    canSwitchMonitor: true,
    protonName: "GE-Proton11-11",
  };

  it("meets everything with the rules on and a working build", () => {
    const needs = resolveRenoDxNeeds(base);
    assert.deepStrictEqual(
      needs.map((need) => [need.id, need.met]),
      [
        ["hdr", true],
        ["hdr_monitor", true],
        ["proton_hdr", true],
      ]
    );
  });

  it("reports the HDR rule turned off", () => {
    const needs = resolveRenoDxNeeds({ ...base, hdrActive: false });
    assert.strictEqual(needs[0].met, false);
    assert.strictEqual(needs[0].reason.code, "need_hdr_off");
  });

  it("leaves the monitor out where Hydra cannot switch it", () => {
    const needs = resolveRenoDxNeeds({ ...base, canSwitchMonitor: false });
    assert.deepStrictEqual(
      needs.map((need) => need.id),
      ["hdr", "proton_hdr"]
    );
  });

  it("lists the HDR display first when the displays are known", () => {
    const needs = resolveRenoDxNeeds({ ...base, hdrDisplay: false });
    assert.strictEqual(needs[0].id, "hdr_display");
    assert.strictEqual(needs[0].met, false);
    assert.strictEqual(needs[0].reason.code, "need_hdr_display_no");
  });

  it("blocks on umu's default but not on an unknown build", () => {
    const byDefault = resolveRenoDxNeeds({ ...base, protonName: null });
    assert.strictEqual(byDefault[2].met, false);
    assert.strictEqual(byDefault[2].reason.code, "need_proton_default");

    const unknown = resolveRenoDxNeeds({ ...base, protonName: "Custom" });
    assert.strictEqual(unknown[2].met, true);
    assert.strictEqual(unknown[2].reason.code, "need_proton_unknown");
  });
});
