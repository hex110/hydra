import { describe, it } from "node:test";
import assert from "node:assert";
import {
  DEFAULT_MANGOHUD_SETTINGS,
  buildGamescopeLaunchOptions,
  buildMangoHudConfig,
  compareProtonNamesNewestFirst,
  getProtonFlavor,
  parseProtonChoice,
} from "./linux-launch.js";

describe("buildGamescopeLaunchOptions", () => {
  it("wraps the command with the chosen flags", () => {
    assert.strictEqual(
      buildGamescopeLaunchOptions({
        width: 3440,
        height: 1440,
        fpsLimit: 120,
        hdr: true,
        fullscreen: true,
      }),
      "gamescope -W 3440 -H 1440 -r 120 -f --hdr-enabled -- %command%"
    );
  });

  it("returns null without settings", () => {
    assert.strictEqual(buildGamescopeLaunchOptions(null), null);
  });

  it("keeps extra arguments", () => {
    assert.strictEqual(
      buildGamescopeLaunchOptions({ extraArgs: "--adaptive-sync" }),
      "gamescope --adaptive-sync -- %command%"
    );
  });
});

describe("buildMangoHudConfig", () => {
  it("lists the metrics, limit and upscaler line", () => {
    const config = buildMangoHudConfig(
      {
        ...DEFAULT_MANGOHUD_SETTINGS,
        metrics: ["fps", "gpu_stats"],
        fpsLimit: 60,
        showUpscaler: true,
        extra: "# comment\nbackground_alpha=0.3",
      },
      "sh status.sh"
    );
    assert.deepStrictEqual(config.trim().split("\n").slice(1), [
      "legacy_layout=0",
      "position=top-left",
      "fps",
      "gpu_stats",
      "fps_limit=60",
      "custom_text=Upscaler",
      "exec=sh status.sh",
      "background_alpha=0.3",
    ]);
  });
});

describe("Proton builds", () => {
  it("recognises managed flavors", () => {
    assert.strictEqual(getProtonFlavor("GE-Proton11-9-x86_64"), "ge-proton");
    assert.strictEqual(
      getProtonFlavor("proton-cachyos-11.0-20261014-slr-x86_64_v3"),
      "proton-cachyos"
    );
    assert.strictEqual(getProtonFlavor("Proton 9.0"), null);
  });

  it("sorts newest first", () => {
    const names = ["GE-Proton10-30", "GE-Proton11-9", "GE-Proton11-10"];
    assert.deepStrictEqual(names.sort(compareProtonNamesNewestFirst), [
      "GE-Proton11-10",
      "GE-Proton11-9",
      "GE-Proton10-30",
    ]);
  });

  it("parses rule choices", () => {
    assert.deepStrictEqual(parseProtonChoice("ge-proton:latest"), {
      flavor: "ge-proton",
    });
    assert.deepStrictEqual(parseProtonChoice("/opt/proton"), {
      path: "/opt/proton",
    });
    assert.strictEqual(parseProtonChoice(""), null);
  });
});
