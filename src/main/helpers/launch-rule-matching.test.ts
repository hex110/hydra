import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { LaunchRule } from "@types";
import { findLaunchRuleMatches } from "./launch-rule-matching.ts";
import {
  matchesLaunchRulePattern,
  mergeLaunchRules,
  parseLaunchRuleFiles,
  parseLaunchRulesExport,
} from "../../shared/launch-rules.js";

const rule = (
  id: string,
  files: string[],
  enabled = true,
  matchAllGames = false
): LaunchRule => ({
  id,
  name: id,
  enabled,
  matchAllGames,
  files,
  launchOptions: "%command%",
});

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "hydra-rules-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("findLaunchRuleMatches", () => {
  it("finds the shallowest match per file-based rule", async () => {
    for (const file of [
      "Game.exe",
      "Game_Data/Plugins/x86_64/UnityPlayer.dll",
      "UnityPlayer.dll",
      "bin/ReShade.ini",
      "EasyAntiCheat/settings.json",
    ]) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), "");
    }

    const matches = await findLaunchRuleMatches(root, [
      rule("unity", ["unityplayer.dll"]),
      rule("reshade", ["ReShade.ini"]),
      rule("eac", ["EasyAntiCheat"]),
      rule("disabled", ["Game.exe"], false),
      rule("everywhere", ["Game.exe"], true, true),
      rule("missing", ["nothing.dll"]),
    ]);

    assert.deepStrictEqual(Object.fromEntries(matches), {
      unity: "UnityPlayer.dll",
      reshade: path.join("bin", "ReShade.ini"),
      eac: "EasyAntiCheat",
      disabled: "Game.exe",
    });
  });
});

describe("launch rule helpers", () => {
  it("matches wildcards case-insensitively", () => {
    assert.ok(
      matchesLaunchRulePattern("start_protected_game.exe", "*protected*.exe")
    );
    assert.ok(matchesLaunchRulePattern("ReShade.INI", "reshade.ini"));
    assert.ok(!matchesLaunchRulePattern("ReShade.ini.bak", "ReShade.ini"));
    assert.ok(!matchesLaunchRulePattern("x.dll", "  "));
  });

  it("splits file lists on commas and new lines", () => {
    assert.deepStrictEqual(parseLaunchRuleFiles("a.dll, b.ini\n\n c"), [
      "a.dll",
      "b.ini",
      "c",
    ]);
  });

  it("imports exports, dropping invalid rules and replacing same ids", () => {
    const imported = parseLaunchRulesExport(
      JSON.stringify({ launchRules: [rule("a", ["x"]), { id: 3 }] })
    );
    assert.deepStrictEqual(
      imported?.map((item) => item.id),
      ["a"]
    );
    assert.strictEqual(parseLaunchRulesExport("not json"), null);

    const merged = mergeLaunchRules(
      [rule("a", ["old"]), rule("b", ["y"])],
      imported!
    );
    assert.deepStrictEqual(
      merged.map((item) => [item.id, item.files[0]]),
      [
        ["b", "y"],
        ["a", "x"],
      ]
    );
  });
});
