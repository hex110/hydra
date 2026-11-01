import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PlayActivityEntry } from "@types";

import { findFirstPlayDay } from "./play-dates.js";

describe("findFirstPlayDay", () => {
  const entries: PlayActivityEntry[] = [
    { date: "2026-03-01", games: { "steam:1": 60_000 } },
    { date: "2026-02-10", games: { "custom:x": 30_000 } },
    { date: "2026-04-02", games: { "steam:1": 10_000, "steam:2": 5_000 } },
  ];

  it("finds the first day any copy was played", () => {
    assert.equal(findFirstPlayDay(entries, ["steam:1"]), "2026-03-01");
    assert.equal(
      findFirstPlayDay(entries, ["steam:1", "custom:x"]),
      "2026-02-10"
    );
  });

  it("has none for a game never played", () => {
    assert.equal(findFirstPlayDay(entries, ["epic:z"]), null);
  });
});
