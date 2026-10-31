import { describe, it } from "node:test";
import assert from "node:assert";
import type { GameRun } from "@types";
import { evaluateRunChecks } from "./run-checks-core.ts";

const run = (fields: Partial<GameRun> = {}) =>
  ({
    outcome: "ended",
    gameDetected: true,
    durationInMilliseconds: 600_000,
    tools: [
      { name: "ReShade", version: "6.8.0" },
      { name: "RenoDX", version: "2026-10-01" },
    ],
    ...fields,
  }) as GameRun;

describe("evaluateRunChecks", () => {
  it("fails RenoDX when the colour space could not be set", () => {
    const [check] = evaluateRunChecks(run(), {
      "ReShade.log": "[INFO] ChangeColorSpace failed (0x80070057)",
    });
    assert.strictEqual(check.capability, "renodx");
    assert.strictEqual(check.status, "failed");
    assert.strictEqual(check.reason.code, "check_renodx_colour_space");
  });

  it("matches the lines RenoDX actually logs (src/utils/swapchain.hpp)", () => {
    for (const line of [
      "22:29:51:819 [15256] | WARN  | renodx::utils::swapchain::ChangeColorSpace(Failed to set DirectX color space, hr = 0x80070057)",
      "22:29:51:819 [15256] | ERROR | changeColorSpace(Failed to get native swap chain)",
    ]) {
      const [check] = evaluateRunChecks(run(), { "ReShade.log": line });
      assert.strictEqual(check.status, "failed", line);
    }
  });

  it("passes RenoDX when ReShade logged without the failure", () => {
    const [check] = evaluateRunChecks(run(), {
      "ReShade.log": "Colour space hdr10_st2084\nPeak Nits: 1499",
    });
    assert.strictEqual(check.status, "ok");
  });

  it("cannot tell when a long run wrote no ReShade log", () => {
    const [check] = evaluateRunChecks(run(), {});
    assert.strictEqual(check.status, "unclear");
    assert.strictEqual(check.reason.code, "check_renodx_no_log");
  });

  it("cannot tell on a run too short to matter", () => {
    const [check] = evaluateRunChecks(
      run({ durationInMilliseconds: 5_000, gameDetected: false }),
      {}
    );
    assert.strictEqual(check.status, "unclear");
    assert.strictEqual(check.reason.code, "check_too_short");
  });

  it("blames the tools for a game that ended right after starting", () => {
    const checks = evaluateRunChecks(
      run({
        outcome: "closed_early",
        gameDetected: false,
        durationInMilliseconds: 3_000,
        tools: [
          { name: "OptiScaler", version: "0.9" },
          { name: "RenoDX", version: "x" },
        ],
      }),
      { "OptiScaler.log": "loaded" }
    );
    assert.deepStrictEqual(
      checks.map((check) => [check.capability, check.status]),
      [
        ["renodx", "failed"],
        ["optiscaler", "failed"],
      ]
    );
    assert.strictEqual(checks[1].reason.code, "check_early_exit");
  });

  it("does not blame the tools for a crash after a long session", () => {
    const [check] = evaluateRunChecks(
      run({ outcome: "error", durationInMilliseconds: 3_600_000 }),
      { "ReShade.log": "fine" }
    );
    assert.strictEqual(check.status, "ok");
  });

  it("says nothing about a run Hydra did not see end", () => {
    assert.deepStrictEqual(
      evaluateRunChecks(run({ outcome: "unknown" }), {}),
      []
    );
  });

  it("checks nothing for a game without tools", () => {
    assert.deepStrictEqual(evaluateRunChecks(run({ tools: [] }), {}), []);
  });
});
