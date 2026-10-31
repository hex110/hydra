import { describe, it } from "node:test";
import assert from "node:assert";
import type { Game } from "@types";
import {
  capabilityModeFromOverride,
  getCapabilityOverride,
  isLaunchWrapperWanted,
  offloadLaunchOptions,
} from "./game-capabilities.js";
import {
  HDR_LAUNCH_RULE_ID,
  HYPRLAND_HDR_LAUNCH_RULE_ID,
} from "./launch-rules.js";

const game = (fields: Partial<Game>) => fields as Game;

describe("getCapabilityOverride", () => {
  it("reads each capability from the field it always used", () => {
    assert.equal(
      getCapabilityOverride(game({ onlineFixDisabled: true }), "online_fix"),
      false
    );
    const rules = game({
      launchRuleOverrides: {
        [HDR_LAUNCH_RULE_ID]: true,
        [HYPRLAND_HDR_LAUNCH_RULE_ID]: false,
      },
    });
    assert.equal(getCapabilityOverride(rules, "hdr"), true);
    assert.equal(getCapabilityOverride(rules, "hdr_monitor"), false);
    assert.equal(
      getCapabilityOverride(
        game({ renoDxAutoInstallDisabled: true }),
        "renodx"
      ),
      false
    );
  });

  it("lets an opt-out win over a forced install", () => {
    assert.equal(
      getCapabilityOverride(
        game({
          optiScalerAutoInstallDisabled: true,
          capabilityOverrides: { optiscaler: true },
        }),
        "optiscaler"
      ),
      false
    );
    assert.equal(
      getCapabilityOverride(
        game({ capabilityOverrides: { optiscaler: true } }),
        "optiscaler"
      ),
      true
    );
  });

  it("reads the old MangoHud switch as On and ignores its old false", () => {
    assert.equal(
      getCapabilityOverride(game({ autoRunMangohud: true }), "mangohud"),
      true
    );
    assert.equal(
      getCapabilityOverride(game({ autoRunMangohud: false }), "mangohud"),
      null
    );
    assert.equal(
      getCapabilityOverride(
        game({
          autoRunMangohud: true,
          capabilityOverrides: { mangohud: false },
        }),
        "mangohud"
      ),
      false
    );
  });

  it("maps overrides to modes", () => {
    assert.equal(capabilityModeFromOverride(null), "auto");
    assert.equal(capabilityModeFromOverride(true), "on");
    assert.equal(capabilityModeFromOverride(false), "off");
  });
});

describe("isLaunchWrapperWanted", () => {
  it("turns MangoHud off for one game while it is on for every game", () => {
    assert.equal(
      isLaunchWrapperWanted(
        "mangohud",
        game({ capabilityOverrides: { mangohud: false } }),
        { autoRunMangohud: true }
      ),
      false
    );
  });

  it("follows the global setting and launch rules in Auto", () => {
    assert.equal(
      isLaunchWrapperWanted("gamemode", game({}), { autoRunGamemode: true }),
      true
    );
    assert.equal(isLaunchWrapperWanted("gamemode", game({}), null, true), true);
    assert.equal(isLaunchWrapperWanted("mangohud", game({}), null), false);
  });

  it("wants GameMode by default, unless it is set to Never", () => {
    assert.equal(isLaunchWrapperWanted("gamemode", game({}), null), true);
    assert.equal(
      isLaunchWrapperWanted("gamemode", game({}), { autoRunGamemode: false }),
      false
    );
  });
});

describe("offloadLaunchOptions", () => {
  it("uses PRIME render offload and points DXVK at the second GPU", () => {
    const nvidia = offloadLaunchOptions("nvidia");
    assert.match(nvidia, /__NV_PRIME_RENDER_OFFLOAD=1/);
    assert.match(nvidia, /__VK_LAYER_NV_optimus=NVIDIA_only/);
    assert.match(nvidia, /DXVK_FILTER_DEVICE_NAME=NVIDIA/);
    assert.match(nvidia, /%command%$/);
    assert.match(offloadLaunchOptions("amd"), /^DRI_PRIME=1 /);
  });
});
