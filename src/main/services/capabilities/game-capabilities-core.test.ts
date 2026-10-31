import { describe, it } from "node:test";
import assert from "node:assert";
import type { Game, GameOptiScalerStatus, GameRenoDxStatus } from "@types";
import {
  resolveLaunchRuleCapability,
  resolveDiscreteGpu,
  resolveLaunchWrapper,
  resolveOnlineFix,
  resolveOptiScaler,
  resolveRenoDx,
} from "./game-capabilities-core.ts";

const game = (fields: Partial<Game> = {}) => fields as Game;

const renoDxStatus = (
  fields: Partial<GameRenoDxStatus> = {}
): GameRenoDxStatus => ({
  installDirectory: "/games/x",
  installation: null,
  mod: {
    title: "FromSoft",
    variant: null,
    status: "stable",
    notes: [],
    addonFile: "renodx-fromsoft.addon64",
  },
  unavailable: null,
  proxyDll: "dxgi.dll",
  conflict: null,
  externallyManaged: false,
  missingFiles: [],
  autoInstallDisabled: false,
  antiCheat: null,
  updateAvailable: false,
  latestReShadeVersion: null,
  ...fields,
});

const optiStatus = (
  fields: Partial<GameOptiScalerStatus> = {}
): GameOptiScalerStatus => ({
  installDirectory: "/games/x",
  installation: null,
  externallyManaged: false,
  missingFiles: [],
  conflictingWrappers: [],
  eligibility: {
    eligible: true,
    reasons: ["native-upscaler"],
    upscalerLibraries: ["nvngx_dlss.dll"],
    compatibility: null,
    blocked: false,
  },
  autoInstallDisabled: false,
  latestVersion: null,
  defaultProxyDll: null,
  ...fields,
});

describe("resolveOnlineFix", () => {
  it("offers only Auto and Off", () => {
    const result = resolveOnlineFix(
      game({ onlineFix: { proxyDlls: ["winmm"] } as Game["onlineFix"] }),
      null
    );
    assert.deepEqual(result.modes, ["auto", "off"]);
    assert.equal(result.active, true);
    assert.deepEqual(result.reason, {
      code: "online_fix_found",
      params: { dlls: "winmm.dll" },
    });
  });

  it("explains a global switch-off", () => {
    assert.equal(
      resolveOnlineFix(game(), { prepareOnlineFixGames: false } as never).reason
        .code,
      "online_fix_off_in_settings"
    );
  });
});

describe("resolveLaunchRuleCapability", () => {
  const rule = {
    id: "preset-hyprland-hdr",
    name: "HDR monitor",
    enabled: false,
    files: [],
    launchOptions: "hypr-hdr %command%",
  };

  it("follows the rule's global setting in Auto", () => {
    const result = resolveLaunchRuleCapability("hdr_monitor", game(), rule, {
      canSwitchMonitor: true,
    });
    assert.equal(result.mode, "auto");
    assert.equal(result.active, false);
    assert.equal(result.reason.code, "rule_off_for_every_game");
  });

  it("is blocked off Hyprland when wanted", () => {
    const result = resolveLaunchRuleCapability(
      "hdr_monitor",
      game({ launchRuleOverrides: { "preset-hyprland-hdr": true } }),
      rule,
      { canSwitchMonitor: false }
    );
    assert.equal(result.mode, "on");
    assert.equal(result.blocked, true);
    assert.equal(result.reason.code, "needs_hyprland");
  });

  it("has no modes when the rule was deleted", () => {
    const result = resolveLaunchRuleCapability("hdr", game(), undefined, {
      canSwitchMonitor: true,
    });
    assert.deepEqual(result.modes, []);
    assert.equal(result.reason.code, "rule_removed");
  });
});

describe("resolveRenoDx", () => {
  it("names the mod when automatic installs are off", () => {
    const result = resolveRenoDx(game(), renoDxStatus(), false);
    assert.equal(result.active, false);
    assert.deepEqual(result.reason, {
      code: "renodx_auto_install_off",
      params: { mod: "FromSoft" },
    });
  });

  it("is blocked when forced on without a mod", () => {
    const result = resolveRenoDx(
      game({ capabilityOverrides: { renodx: true } }),
      renoDxStatus({ mod: null, unavailable: "no-mod" }),
      true
    );
    assert.equal(result.mode, "on");
    assert.equal(result.blocked, true);
    assert.equal(result.reason.code, "renodx_no_mod");
  });

  it("stays off in Auto when no display accepts HDR", () => {
    const result = resolveRenoDx(game(), renoDxStatus(), true, [], false);
    assert.equal(result.active, false);
    assert.equal(result.blocked, false);
    assert.equal(result.reason.code, "renodx_no_hdr_display");
  });

  it("explains an anti-cheat skip in Auto", () => {
    assert.equal(
      resolveRenoDx(game(), renoDxStatus({ antiCheat: "EasyAntiCheat" }), true)
        .reason.code,
      "renodx_anti_cheat"
    );
  });
});

describe("resolveOptiScaler", () => {
  it("lists the upscaler it found", () => {
    assert.deepEqual(resolveOptiScaler(game(), optiStatus(), true).reason, {
      code: "optiscaler_available",
      params: { found: "nvngx_dlss.dll" },
    });
  });

  it("reports games the list marks as not working", () => {
    const status = optiStatus();
    status.eligibility = {
      ...status.eligibility!,
      eligible: false,
      blocked: true,
    };
    assert.equal(
      resolveOptiScaler(game(), status, true).reason.code,
      "optiscaler_not_working"
    );
  });
});

describe("resolveLaunchWrapper", () => {
  it("names the rule that turns it on", () => {
    const result = resolveLaunchWrapper("mangohud", game(), {
      globallyOn: false,
      ruleName: "Benchmarks",
      available: true,
    });
    assert.equal(result.active, true);
    assert.deepEqual(result.reason, {
      code: "turned_on_by_rule",
      params: { rule: "Benchmarks" },
    });
  });

  it("is blocked when wanted but not installed", () => {
    const result = resolveLaunchWrapper(
      "gamemode",
      game({ capabilityOverrides: { gamemode: true } }),
      { globallyOn: false, ruleName: null, available: false }
    );
    assert.equal(result.blocked, true);
    assert.equal(result.reason.code, "not_installed_on_system");
  });
});

describe("dependencies", () => {
  const rule = {
    id: "hdr",
    enabled: false,
  } as Parameters<typeof resolveLaunchRuleCapability>[2];

  it("shows the HDR rule as needed by RenoDX when only RenoDX turns it on", () => {
    const result = resolveLaunchRuleCapability(
      "hdr",
      game({ renoDx: {} as Game["renoDx"] }),
      rule,
      { canSwitchMonitor: true, effectiveOverrides: { hdr: true } }
    );
    assert.strictEqual(result.active, true);
    assert.strictEqual(result.mode, "auto");
    assert.strictEqual(result.reason.code, "needed_by_renodx");
  });

  it("marks installed RenoDX blocked, with the missing need as the reason", () => {
    const installation = {
      modTitle: "FromSoft",
      addonVersion: "2026-10-01T00:00:00Z",
    } as NonNullable<GameRenoDxStatus["installation"]>;
    const result = resolveRenoDx(game(), renoDxStatus({ installation }), true, [
      {
        id: "proton_hdr",
        met: false,
        reason: { code: "need_proton_default" },
      },
    ]);
    assert.strictEqual(result.active, true);
    assert.strictEqual(result.blocked, true);
    assert.strictEqual(result.reason.code, "need_proton_default");
    assert.strictEqual(result.needs.length, 1);
  });
});

describe("first-run checks", () => {
  const checks = {
    renodx: { runId: "r1", at: "now", reason: { code: "check_early_exit" } },
  };
  const installation = {
    modTitle: "FromSoft",
    addonVersion: "2026-10-01T00:00:00Z",
  } as NonNullable<GameRenoDxStatus["installation"]>;

  it("marks an automatic install failed, with the check as the reason", () => {
    const result = resolveRenoDx(
      game({ capabilityChecks: checks }),
      renoDxStatus({ installation }),
      true
    );
    assert.strictEqual(result.failed, true);
    assert.strictEqual(result.active, true);
    assert.strictEqual(result.reason.code, "check_early_exit");
  });

  it("ignores a failure once the game has its own choice", () => {
    const result = resolveRenoDx(
      game({
        capabilityChecks: checks,
        capabilityOverrides: { renodx: true },
      }),
      renoDxStatus({ installation }),
      true
    );
    assert.strictEqual(result.failed, false);
  });
});

describe("resolveDiscreteGpu", () => {
  const nvidia = {
    card: "card0",
    vendor: "nvidia" as const,
    driver: "nvidia",
    bootDisplay: false,
  };

  it("leaves the game on the screen's GPU in Auto and names the other one", () => {
    const result = resolveDiscreteGpu(game(), nvidia);
    assert.equal(result.active, false);
    assert.deepEqual(result.reason, {
      code: "discrete_gpu_auto",
      params: { vendor: "NVIDIA" },
    });
  });

  it("runs the game on it when set On", () => {
    const result = resolveDiscreteGpu(
      game({ capabilityOverrides: { discrete_gpu: true } }),
      nvidia
    );
    assert.equal(result.mode, "on");
    assert.equal(result.active, true);
  });
});
