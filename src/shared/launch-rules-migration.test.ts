import { describe, it } from "node:test";
import assert from "node:assert";
import type { Game, LaunchRule } from "@types";
import {
  migrateLegacyLaunchSettings,
  migrateReShadeLaunchRule,
} from "./launch-rules-migration.js";
import {
  HDR_LAUNCH_RULE_ID,
  LAUNCH_RULE_PRESETS,
  LEGACY_RESHADE_LAUNCH_OPTIONS,
  RESHADE_LAUNCH_RULE_ID,
} from "./launch-rules.js";

const game = (extra: Partial<Game>) => ({ title: "x", ...extra }) as Game;

describe("migrateLegacyLaunchSettings", () => {
  it("does nothing for installs without legacy settings", () => {
    const result = migrateLegacyLaunchSettings({}, [["steam:1", game({})]]);
    assert.strictEqual(result.launchRules, null);
    assert.strictEqual(result.gameOverrides.size, 0);
  });

  it("turns the global HDR switch into the HDR rule", () => {
    const result = migrateLegacyLaunchSettings({ enableHdr: true }, []);
    const hdr = result.launchRules?.find((r) => r.id === HDR_LAUNCH_RULE_ID);
    assert.strictEqual(hdr?.enabled, true);
    assert.strictEqual(hdr?.matchAllGames, true);
  });

  it("adds the HDR rule to edited rule lists and keeps the others", () => {
    const custom: LaunchRule = {
      id: "mine",
      name: "Mine",
      enabled: true,
      files: ["a.dll"],
      launchOptions: "%command%",
    };
    const result = migrateLegacyLaunchSettings(
      { enableHdr: false, launchRules: [custom] },
      []
    );
    assert.deepStrictEqual(
      result.launchRules?.map((r) => [r.id, r.enabled]),
      [
        ["mine", true],
        [HDR_LAUNCH_RULE_ID, false],
      ]
    );
  });

  it("turns per-game HDR and ignored rules into overrides", () => {
    const result = migrateLegacyLaunchSettings({}, [
      [
        "steam:1",
        game({ hdrEnabled: true, ignoredLaunchRules: ["preset-reshade"] }),
      ],
      ["steam:2", game({ hdrEnabled: null })],
      ["steam:3", game({})],
    ]);
    assert.deepStrictEqual(Object.fromEntries(result.gameOverrides), {
      "steam:1": { "preset-reshade": false, [HDR_LAUNCH_RULE_ID]: true },
      "steam:2": {},
    });
    assert.ok(
      result.launchRules?.some((r) => r.id === HDR_LAUNCH_RULE_ID && !r.enabled)
    );
  });
});

describe("migrateReShadeLaunchRule", () => {
  const rule = (launchOptions: string): LaunchRule => ({
    id: RESHADE_LAUNCH_RULE_ID,
    name: "ReShade",
    enabled: true,
    files: ["ReShade.ini"],
    launchOptions,
  });
  const current = LAUNCH_RULE_PRESETS.find(
    (preset) => preset.id === RESHADE_LAUNCH_RULE_ID
  )!;

  it("drops the d3dcompiler_47 override from a saved rule", () => {
    const result = migrateReShadeLaunchRule([
      rule(LEGACY_RESHADE_LAUNCH_OPTIONS),
    ]);
    assert.strictEqual(result?.[0].launchOptions, current.launchOptions);
    assert.ok(!result?.[0].launchOptions.includes("d3dcompiler_47"));
  });

  it("keeps the rule's other settings", () => {
    const result = migrateReShadeLaunchRule([
      { ...rule(LEGACY_RESHADE_LAUNCH_OPTIONS), enabled: false },
    ]);
    assert.strictEqual(result?.[0].enabled, false);
    assert.deepStrictEqual(result?.[0].files, ["ReShade.ini"]);
  });

  it("leaves edited rules, other rules and unsaved lists alone", () => {
    assert.strictEqual(migrateReShadeLaunchRule(null), null);
    assert.strictEqual(
      migrateReShadeLaunchRule([rule("MY_VAR=1 %command%")]),
      null
    );
    assert.strictEqual(
      migrateReShadeLaunchRule([
        { ...rule(LEGACY_RESHADE_LAUNCH_OPTIONS), id: "mine" },
      ]),
      null
    );
  });
});
