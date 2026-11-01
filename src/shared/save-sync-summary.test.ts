import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SaveSyncStatus } from "@types";

import { summarizeSaveSync } from "./save-sync-summary.js";

const status = (fields: Partial<SaveSyncStatus>): SaveSyncStatus => ({
  shop: "steam",
  objectId: "1",
  at: "2026-11-01T10:00:00.000Z",
  status: "completed",
  lastSuccessAt: "2026-11-01T10:00:00.000Z",
  ...fields,
});

describe("summarizeSaveSync", () => {
  it("finds the newest backup and the games that failed", () => {
    const summary = summarizeSaveSync([
      status({ objectId: "1" }),
      status({
        objectId: "2",
        at: "2026-11-01T12:00:00.000Z",
        status: "failed",
        lastSuccessAt: "2026-10-30T09:00:00.000Z",
      }),
      status({
        objectId: "3",
        at: "2026-11-01T11:00:00.000Z",
        lastSuccessAt: "2026-11-01T11:00:00.000Z",
      }),
      status({
        objectId: "4",
        at: "2026-11-01T13:00:00.000Z",
        status: "conflict",
      }),
    ]);

    assert.equal(summary.lastBackupAt, "2026-11-01T11:00:00.000Z");
    assert.deepEqual(
      summary.failing.map((entry) => entry.objectId),
      ["4", "2"]
    );
  });

  it("is empty without any sync", () => {
    assert.deepEqual(summarizeSaveSync([]), {
      lastBackupAt: null,
      failing: [],
    });
  });
});
