import assert from "node:assert/strict";
import { it } from "node:test";
import type { LibraryGame } from "@types";
import { getLastActivityTime } from "./library-activity.js";

const game = (fields: Record<string, unknown>) =>
  ({
    lastTimePlayed: null,
    download: null,
    ...fields,
  }) as unknown as LibraryGame;

it("counts a started download as activity", () => {
  assert.equal(
    getLastActivityTime(
      game({
        lastTimePlayed: new Date(1000),
        download: { timestamp: 5000 },
      })
    ),
    5000
  );
});

it("counts a finished download and a Steam install start", () => {
  assert.equal(
    getLastActivityTime(
      game({ download: { timestamp: 5000, completedAt: 9000 } })
    ),
    9000
  );
  assert.equal(
    getLastActivityTime(game({ downloadStartedAt: new Date(7000) })),
    7000
  );
});

it("has no activity for a game that was only added", () => {
  assert.equal(getLastActivityTime(game({})), null);
});
