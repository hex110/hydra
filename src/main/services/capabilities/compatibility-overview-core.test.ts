import { describe, it } from "node:test";
import assert from "node:assert";
import type { Game, GameRun } from "@types";
import { buildOverviewRow } from "./compatibility-overview-core.ts";

const game = (fields: Partial<Game> = {}) =>
  ({ shop: "custom", objectId: "x", title: "X", ...fields }) as Game;
const windows = { isWindows: true, isLinux: true };

describe("buildOverviewRow", () => {
  it("shows installed tools and marks a failed automatic install", () => {
    const row = buildOverviewRow(
      game({
        renoDx: {} as Game["renoDx"],
        capabilityChecks: {
          renodx: { runId: "r", at: "", reason: { code: "check_early_exit" } },
        },
      }),
      null,
      windows
    );
    assert.deepStrictEqual(row.renodx, {
      mode: "auto",
      installed: true,
      failed: true,
    });
    assert.strictEqual(row.optiscaler?.installed, false);
  });

  it("shows no tools for a native game", () => {
    const row = buildOverviewRow(game(), null, {
      isWindows: false,
      isLinux: true,
    });
    assert.strictEqual(row.renodx, null);
    assert.strictEqual(row.onlineFix, null);
  });

  it("counts failed checks of the last run and reports an update", () => {
    const run = {
      id: "r1",
      startedAt: "t",
      outcome: "closed_early",
      checks: [
        { capability: "renodx", status: "failed" },
        { capability: "optiscaler", status: "ok" },
      ],
    } as GameRun;
    const row = buildOverviewRow(
      game({ availableUpdate: {} as Game["availableUpdate"] }),
      run,
      windows
    );
    assert.strictEqual(row.lastRun?.failedChecks, 1);
    assert.strictEqual(row.updateAvailable, true);
  });

  it("reads a per-game Off", () => {
    const row = buildOverviewRow(
      game({ renoDxAutoInstallDisabled: true }),
      null,
      windows
    );
    assert.strictEqual(row.renodx?.mode, "off");
  });
});
