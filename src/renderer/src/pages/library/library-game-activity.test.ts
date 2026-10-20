import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-ignore The Node ESM test runner requires the source extension.
import { getLibraryGameActivity } from "./library-game-activity.ts";

const idle = {
  activeDownload: null,
  extraction: null,
  setupGameIds: new Set<string>(),
};

const download = (overrides: Record<string, unknown> = {}) => ({
  status: "paused",
  queued: false,
  progress: 0.4,
  extracting: false,
  ...overrides,
});

describe("getLibraryGameActivity", () => {
  it("shows nothing for an idle game", () => {
    assert.equal(getLibraryGameActivity({ id: "steam:1" }, idle), null);
    assert.equal(
      getLibraryGameActivity(
        { id: "steam:1", download: download({ status: "complete" }) },
        idle
      ),
      null
    );
  });

  it("uses live progress for the running download and extraction", () => {
    const game = { id: "steam:1", download: download({ status: "active" }) };
    assert.deepEqual(
      getLibraryGameActivity(game, {
        ...idle,
        activeDownload: { gameId: "steam:1", progress: 0.75 },
      }),
      { kind: "downloading", progress: 0.75 }
    );
    assert.deepEqual(
      getLibraryGameActivity(game, {
        ...idle,
        extraction: { gameId: "steam:1", progress: 0.2 },
      }),
      { kind: "extracting", progress: 0.2 }
    );
  });

  it("tells paused and queued downloads apart", () => {
    assert.deepEqual(
      getLibraryGameActivity({ id: "a", download: download() }, idle),
      { kind: "paused", progress: 0.4 }
    );
    assert.deepEqual(
      getLibraryGameActivity(
        { id: "a", download: download({ queued: true }) },
        idle
      ),
      { kind: "queued", progress: 0.4 }
    );
  });

  it("shows setup, and checks every copy of a grouped game", () => {
    assert.deepEqual(
      getLibraryGameActivity(
        { id: "steam:1", members: [{ id: "steam:1" }, { id: "epic:x" }] },
        { ...idle, setupGameIds: new Set(["epic:x"]) }
      ),
      { kind: "setup", progress: null }
    );
  });
});
