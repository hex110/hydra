import { describe, it } from "node:test";
import assert from "node:assert";
import {
  capabilityDefaultPatch,
  getCapabilityDefault,
} from "./capability-defaults.js";
import { HDR_LAUNCH_RULE_ID } from "./launch-rules.js";

describe("capability defaults", () => {
  it("reads the old preference fields", () => {
    assert.strictEqual(getCapabilityDefault("online_fix", {}), "auto");
    assert.strictEqual(
      getCapabilityDefault("online_fix", { prepareOnlineFixGames: false }),
      "never"
    );
    assert.strictEqual(getCapabilityDefault("renodx", {}), "never");
    assert.strictEqual(
      getCapabilityDefault("optiscaler", { optiScalerAutoInstall: true }),
      "auto"
    );
    assert.strictEqual(
      getCapabilityDefault("mangohud", { autoRunMangohud: true }),
      "always"
    );
  });

  it("round-trips through the patch", () => {
    for (const [id, mode] of [
      ["online_fix", "never"],
      ["renodx", "auto"],
      ["optiscaler", "auto"],
      ["mangohud", "always"],
      ["gamemode", "always"],
      ["gamemode", "never"],
      ["gamemode", "auto"],
    ] as const) {
      const patch = capabilityDefaultPatch(id, mode, {});
      assert.strictEqual(getCapabilityDefault(id, patch), mode, id);
    }
  });

  it("turns a built-in launch rule on and off without touching the others", () => {
    const on = capabilityDefaultPatch("hdr", "always", {});
    assert.strictEqual(getCapabilityDefault("hdr", on), "always");
    const rules = on.launchRules!;
    assert.strictEqual(
      rules.find((rule) => rule.id === HDR_LAUNCH_RULE_ID)?.enabled,
      true
    );
    const off = capabilityDefaultPatch("hdr", "never", on);
    assert.strictEqual(getCapabilityDefault("hdr", off), "never");
    assert.strictEqual(off.launchRules!.length, rules.length);
  });
});
