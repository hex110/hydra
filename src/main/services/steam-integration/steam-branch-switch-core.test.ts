import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  runSteamBranchSwitch,
  type SteamBranchSwitchSteps,
} from "./steam-branch-switch-core.ts";

const harness = (overrides: Partial<SteamBranchSwitchSteps> = {}) => {
  const calls: string[] = [];
  let running = true;
  const steps: SteamBranchSwitchSteps = {
    branch: () => ({ name: "beta", passwordRequired: false }),
    isSteamRunning: async () => running,
    shutdownSteam: async () => {
      calls.push("shutdown");
      running = false;
      return true;
    },
    readManifest: async () => {
      calls.push(running ? "read-while-running" : "read");
      return "manifest";
    },
    backupManifest: async () => void calls.push("backup"),
    editManifest: (content) => `${content}+beta`,
    writeManifest: async (content) => {
      calls.push(running ? "write-while-running" : `write:${content}`);
    },
    startSteam: async () => {
      calls.push("start");
      running = true;
      return true;
    },
    validate: async () => void calls.push("validate"),
    ...overrides,
  };
  return { steps, calls };
};

describe("runSteamBranchSwitch", () => {
  it("closes Steam, edits a backed up manifest, then restarts Steam", async () => {
    const { steps, calls } = harness();

    assert.equal(await runSteamBranchSwitch(steps), "switched");
    assert.deepEqual(calls, [
      "shutdown",
      "read",
      "backup",
      "write:manifest+beta",
      "start",
      "validate",
    ]);
  });

  it("does not shut Steam down when it is not running", async () => {
    const { steps, calls } = harness({ isSteamRunning: async () => false });

    assert.equal(await runSteamBranchSwitch(steps), "switched");
    assert.equal(calls.includes("shutdown"), false);
  });

  it("never touches the manifest while Steam will not close", async () => {
    const { steps, calls } = harness({ shutdownSteam: async () => false });

    assert.equal(await runSteamBranchSwitch(steps), "steam-would-not-close");
    assert.deepEqual(calls, []);
  });

  it("refuses unknown and password-protected branches before anything else", async () => {
    const unknown = harness({ branch: () => null });
    assert.equal(await runSteamBranchSwitch(unknown.steps), "unknown-branch");

    const locked = harness({
      branch: () => ({ name: "secret", passwordRequired: true }),
    });
    assert.equal(await runSteamBranchSwitch(locked.steps), "branch-locked");
    assert.deepEqual([...unknown.calls, ...locked.calls], []);
  });

  it("reports a manifest it cannot read or edit, writing nothing", async () => {
    const unreadable = harness({ readManifest: async () => null });
    assert.equal(
      await runSteamBranchSwitch(unreadable.steps),
      "manifest-unreadable"
    );

    const uneditable = harness({ editManifest: () => null });
    assert.equal(
      await runSteamBranchSwitch(uneditable.steps),
      "manifest-unreadable"
    );
    assert.equal(
      [...unreadable.calls, ...uneditable.calls].some((call) =>
        call.startsWith("write")
      ),
      false
    );
  });

  it("reports a manifest it cannot write and does not start Steam", async () => {
    const { steps, calls } = harness({
      writeManifest: async () => {
        throw new Error("EACCES");
      },
    });

    assert.equal(await runSteamBranchSwitch(steps), "manifest-unwritable");
    assert.equal(calls.includes("start"), false);
  });

  it("reports a Steam that does not start", async () => {
    const { steps, calls } = harness({ startSteam: async () => false });

    assert.equal(await runSteamBranchSwitch(steps), "steam-start-failed");
    assert.equal(calls.includes("validate"), false);
  });
});
