import assert from "node:assert/strict";
import { it } from "node:test";

import {
  clearAbandonedPreLaunchSync,
  isPreLaunchSyncAbandoned,
  waitForPreLaunchSync,
} from "./pre-launch-wait.js";

const never = () => new Promise<string>(() => {});

it("gives up on a sync that is still analysing after the limit", async () => {
  clearAbandonedPreLaunchSync("1", "steam");
  const outcome = await waitForPreLaunchSync(never(), {
    objectId: "1",
    shop: "steam",
    getStage: () => "analyzing",
    onGiveUp: () => "offline",
    maxWaitMs: 30,
    pollMs: 5,
  });
  assert.equal(outcome, "offline");
  assert.equal(isPreLaunchSyncAbandoned("1", "steam"), true);
  clearAbandonedPreLaunchSync("1", "steam");
  assert.equal(isPreLaunchSyncAbandoned("1", "steam"), false);
});

it("keeps waiting while the sync restores, then returns its outcome", async () => {
  let stage = "restoring";
  let finish: (value: string) => void = () => {};
  const sync = new Promise<string>((resolve) => (finish = resolve));
  setTimeout(() => finish("completed"), 80);
  const outcome = await waitForPreLaunchSync(sync, {
    objectId: "2",
    shop: "steam",
    getStage: () => stage,
    onGiveUp: () => "offline",
    maxWaitMs: 20,
    pollMs: 5,
  });
  stage = "analyzing";
  assert.equal(outcome, "completed");
  assert.equal(isPreLaunchSyncAbandoned("2", "steam"), false);
});

it("returns a fast sync's outcome without abandoning it", async () => {
  const outcome = await waitForPreLaunchSync(Promise.resolve("completed"), {
    objectId: "3",
    shop: "steam",
    getStage: () => undefined,
    onGiveUp: () => "offline",
    maxWaitMs: 50,
    pollMs: 5,
  });
  assert.equal(outcome, "completed");
  assert.equal(isPreLaunchSyncAbandoned("3", "steam"), false);
});
