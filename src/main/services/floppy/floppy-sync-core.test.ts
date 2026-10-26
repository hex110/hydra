import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FLOPPY_STATUS,
  normalizeTitle,
  pickMatch,
  planPatch,
  type FloppyGameInput,
  type FloppyTrackedState,
} from "./floppy-sync-core.js";

const untracked: FloppyTrackedState = {
  tracked: false,
  status: null,
  progress: 0,
};
const tracked = (status: number, progress = 0): FloppyTrackedState => ({
  tracked: true,
  status,
  progress,
});
const game = (overrides: Partial<FloppyGameInput> = {}): FloppyGameInput => ({
  title: "Hades",
  playTimeInMilliseconds: 0,
  ...overrides,
});

describe("normalizeTitle", () => {
  it("ignores case, marks and punctuation", () => {
    assert.equal(normalizeTitle("Hades™: Édition!"), "hades edition");
    assert.equal(normalizeTitle("Ratchet & Clank"), "ratchet and clank");
  });
});

describe("pickMatch", () => {
  const results = [
    { media_id: 1, title: "Hades II", platforms: ["PC (Microsoft Windows)"] },
    { media_id: 2, title: "Hades", platforms: ["Nintendo Switch"] },
    { media_id: 3, title: "Hades", platforms: ["PC (Microsoft Windows)"] },
  ];

  it("takes an exact title, preferring the PC release", () => {
    assert.equal(pickMatch("hades", results)?.media_id, 3);
  });

  it("does not guess when nothing matches exactly", () => {
    assert.equal(pickMatch("Hade", results), null);
  });
});

describe("planPatch", () => {
  it("pushes playtime in whole minutes and starts the game", () => {
    assert.deepEqual(
      planPatch(
        game({ playTimeInMilliseconds: 125_000 }),
        untracked,
        "playtime"
      ),
      { progress: 2, status: FLOPPY_STATUS.inProgress }
    );
  });

  it("never lowers playtime entered in Floppy", () => {
    assert.deepEqual(
      planPatch(
        game({ playTimeInMilliseconds: 60_000 }),
        tracked(FLOPPY_STATUS.completed, 500),
        "playtime"
      ),
      {}
    );
  });

  it("does not create an entry without a signal", () => {
    assert.deepEqual(planPatch(game(), untracked, "backfill"), {});
  });

  it("puts a wishlisted game on Planning", () => {
    assert.deepEqual(
      planPatch(game({ wishlisted: true }), untracked, "wishlist"),
      { status: FLOPPY_STATUS.planning }
    );
  });

  it("applies an explicit status change over an existing status", () => {
    assert.deepEqual(
      planPatch(
        game({ playStatus: "finished" }),
        tracked(FLOPPY_STATUS.inProgress),
        "status"
      ),
      { status: FLOPPY_STATUS.completed }
    );
  });

  it("keeps a status set in Floppy when only playtime changed", () => {
    for (const status of [
      FLOPPY_STATUS.completed,
      FLOPPY_STATUS.dropped,
      FLOPPY_STATUS.paused,
    ]) {
      assert.deepEqual(
        planPatch(
          game({ playStatus: "playing", playTimeInMilliseconds: 120_000 }),
          tracked(status, 2),
          "playtime"
        ),
        {}
      );
    }
  });

  it("promotes an untouched Planning entry once played", () => {
    assert.deepEqual(
      planPatch(
        game({ playTimeInMilliseconds: 600_000 }),
        tracked(FLOPPY_STATUS.planning),
        "playtime"
      ),
      { progress: 10, status: FLOPPY_STATUS.inProgress }
    );
  });
});
