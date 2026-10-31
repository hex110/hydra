import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { GameRun } from "@types";

import {
  classifyRunOutcome,
  closeLeftoverRun,
  formatRunSummary,
  gameFolderName,
  gameFolderSuffix,
  runIdFromDate,
  selectRunsToPrune,
} from "./game-runs-core.ts";

const run = (overrides: Partial<GameRun> = {}): GameRun => ({
  id: "2026-10-29T12-00-00Z",
  shop: "custom",
  objectId: "abc",
  title: "Sekiro",
  startedAt: "2026-10-29T12:00:00.000Z",
  endedAt: "2026-10-29T13:00:00.000Z",
  durationInMilliseconds: 3_600_000,
  outcome: "ended",
  exitCode: 0,
  signal: null,
  gameDetected: true,
  launcher: "umu",
  executablePath: "/games/Sekiro/sekiro.exe",
  commandLine: "umu-run /games/Sekiro/sekiro.exe",
  environment: { WINEDLLOVERRIDES: "dxgi=n,b" },
  protonPath: "/protons/GE-Proton11-11",
  winePrefixPath: "/prefixes/sekiro",
  tools: [{ name: "RenoDX", version: "0.1", detail: "fromsoft_engine" }],
  events: [],
  logs: [
    {
      name: "ReShade.log",
      source: "/games/Sekiro/ReShade.log",
      sizeInBytes: 10,
      truncated: false,
    },
  ],
  directory: "/runs/sekiro--custom-abc/2026-10-29T12-00-00Z",
  ...overrides,
});

describe("game run folders", () => {
  it("names a game's folder after its title and keeps the key at the end", () => {
    assert.equal(
      gameFolderName("Sekiro: Shadows Die Twice", "custom", "a/b"),
      "sekiro-shadows-die-twice--custom-a_b"
    );
    assert.ok(
      gameFolderName("Sekiro", "custom", "a/b").endsWith(
        gameFolderSuffix("custom", "a/b")
      )
    );
    assert.equal(gameFolderName("!!!", "steam", "1"), "game--steam-1");
  });

  it("makes run ids that sort in time order", () => {
    assert.equal(
      runIdFromDate(new Date("2026-10-29T09:05:01.123Z")),
      "2026-10-29T09-05-01Z"
    );
    assert.deepEqual(
      selectRunsToPrune(
        [
          "2026-10-29T09-00-00Z",
          "2026-10-27T09-00-00Z",
          "2026-10-28T09-00-00Z",
        ],
        2
      ),
      ["2026-10-27T09-00-00Z"]
    );
  });
});

describe("classifyRunOutcome", () => {
  it("calls a short run the game never showed in closed early", () => {
    assert.equal(
      classifyRunOutcome({
        exitCode: 0,
        signal: null,
        gameDetected: false,
        durationInMilliseconds: 2_000,
      }),
      "closed_early"
    );
  });

  it("calls a non-zero code or a signal an error", () => {
    assert.equal(
      classifyRunOutcome({
        exitCode: 3,
        signal: null,
        gameDetected: true,
        durationInMilliseconds: 2_000,
      }),
      "error"
    );
    assert.equal(
      classifyRunOutcome({
        exitCode: null,
        signal: "SIGSEGV",
        gameDetected: true,
        durationInMilliseconds: 600_000,
      }),
      "error"
    );
  });

  it("calls a long run that was never detected ended, not closed early", () => {
    assert.equal(
      classifyRunOutcome({
        exitCode: 0,
        signal: null,
        gameDetected: false,
        durationInMilliseconds: 600_000,
      }),
      "ended"
    );
  });
});

describe("formatRunSummary", () => {
  it("lists the outcome, Proton build, tools, environment and logs", () => {
    const summary = formatRunSummary(run());
    assert.match(summary, /Outcome: ended normally \(exit code 0\)/);
    assert.match(summary, /Proton: GE-Proton11-11/);
    assert.match(summary, /- RenoDX 0\.1 \(fromsoft_engine\)/);
    assert.match(summary, /WINEDLLOVERRIDES=dxgi=n,b/);
    assert.match(summary, /- ReShade\.log: from \/games\/Sekiro\/ReShade\.log/);
    assert.match(summary, /Duration: 1 h 0 min/);
  });

  it("names umu's default Proton when none was chosen", () => {
    assert.match(
      formatRunSummary(run({ protonPath: null })),
      /Proton: umu's default/
    );
  });
});

describe("closeLeftoverRun", () => {
  it("marks a run a stopped Hydra left running as unknown, with an event", () => {
    const closed = closeLeftoverRun(
      run({ outcome: "running", endedAt: null }),
      "2026-10-31T10:00:00.000Z"
    );
    assert.equal(closed.outcome, "unknown");
    assert.deepEqual(closed.events, [
      {
        at: "2026-10-31T10:00:00.000Z",
        message: "Hydra stopped before this run ended.",
      },
    ]);
    assert.match(formatRunSummary(closed), /Outcome: end not seen/);
  });
});
