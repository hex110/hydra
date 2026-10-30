import { describe, it } from "node:test";
import assert from "node:assert";
import type { CompatibilityOverviewRow } from "@types";
import {
  countCompatibilityFilters,
  matchesCompatibilityFilter,
} from "./compatibility-overview.js";

const row = (fields: Partial<CompatibilityOverviewRow> = {}) =>
  ({
    onlineFix: null,
    renodx: null,
    optiscaler: null,
    lastRun: null,
    updateAvailable: false,
    ...fields,
  }) as CompatibilityOverviewRow;

const tool = (fields = {}) => ({
  mode: "auto" as const,
  installed: true,
  failed: false,
  ...fields,
});

describe("compatibility overview filters", () => {
  it("finds games whose last run went wrong", () => {
    const failed = row({
      lastRun: {
        id: "a",
        startedAt: "",
        outcome: "closed_early",
        failedChecks: 0,
      },
    });
    const fine = row({
      lastRun: { id: "b", startedAt: "", outcome: "ended", failedChecks: 0 },
    });
    assert.strictEqual(matchesCompatibilityFilter(failed, "run_failed"), true);
    assert.strictEqual(matchesCompatibilityFilter(fine, "run_failed"), false);
    assert.strictEqual(matchesCompatibilityFilter(row(), "run_failed"), false);
  });

  it("finds failed tools, installed tools and opt-outs", () => {
    const games = [
      row({ renodx: tool({ failed: true }) }),
      row({ optiscaler: tool() }),
      row({ renodx: tool({ mode: "off", installed: false }) }),
    ];
    const counts = countCompatibilityFilters(games);
    assert.strictEqual(counts.all, 3);
    assert.strictEqual(counts.tool_failed, 1);
    assert.strictEqual(counts.optiscaler, 1);
    assert.strictEqual(counts.renodx, 1);
    assert.strictEqual(counts.opted_out, 1);
  });

  it("finds games with an update", () => {
    assert.strictEqual(
      matchesCompatibilityFilter(row({ updateAvailable: true }), "update"),
      true
    );
  });
});
