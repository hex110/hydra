import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  GAME_LAUNCHER_AUTO_CLOSE_DELAY_MS,
  addLaunchPhase,
  getLaunchPhase,
  GAME_STARTED_AUTO_CLOSE_DELAY_MS,
  canGameLauncherAutoClose,
  createLauncherStatusReplay,
  getGameLauncherAction,
  getGameLauncherAutoCloseDelay,
  getLauncherStatusGroup,
} from "./game-launcher-state.js";

describe("game launcher close delay", () => {
  it("closes quickly once the game was detected", () => {
    assert.equal(
      getGameLauncherAutoCloseDelay(true),
      GAME_STARTED_AUTO_CLOSE_DELAY_MS
    );
    assert.equal(
      getGameLauncherAutoCloseDelay(false),
      GAME_LAUNCHER_AUTO_CLOSE_DELAY_MS
    );
    assert.ok(
      GAME_STARTED_AUTO_CLOSE_DELAY_MS < GAME_LAUNCHER_AUTO_CLOSE_DELAY_MS
    );
  });

  it("treats game detection as a compatibility status", () => {
    assert.equal(getLauncherStatusGroup("game_started"), "compatibility");
    assert.equal(getLauncherStatusGroup("launch_cancelled"), "compatibility");
  });
});

describe("game launcher status replay", () => {
  it("ignores other games before replaying cached statuses", () => {
    const replay = createLauncherStatusReplay("steam:123");

    assert.equal(
      replay.acceptLiveStatus({
        gameKey: "steam:999",
        status: "preparing_compatibility_layer",
        detail: "Downloading steamrt3",
      }),
      false
    );

    assert.deepEqual(
      replay.selectCachedStatuses([
        {
          gameKey: "steam:123",
          status: "preparing_compatibility_layer",
          detail: "Downloading steamrt3",
        },
      ]),
      [
        {
          gameKey: "steam:123",
          status: "preparing_compatibility_layer",
          detail: "Downloading steamrt3",
        },
      ]
    );
  });

  it("keeps live statuses over cached ones of the same group only", () => {
    const replay = createLauncherStatusReplay("steam:123");

    assert.equal(
      replay.acceptLiveStatus({
        gameKey: "steam:123",
        status: "generating_achievements",
        detail: null,
      }),
      true
    );

    assert.deepEqual(
      replay
        .selectCachedStatuses([
          { gameKey: "steam:123", status: "complete", detail: null },
          {
            gameKey: "steam:123",
            status: "compatibility_layer_failed",
            detail: "RuntimeError: runtime setup failed",
          },
        ])
        .map(({ status }) => status),
      ["compatibility_layer_failed"]
    );
  });
});

describe("game launcher action", () => {
  it("can cancel while the compatibility layer is preparing", () => {
    assert.equal(getGameLauncherAction("preparing"), "cancel");
  });

  it("only offers closing once setup failed", () => {
    assert.equal(getGameLauncherAction("failed"), "close");
  });

  it("offers nothing otherwise", () => {
    assert.equal(getGameLauncherAction("idle"), null);
  });
});

describe("game launcher auto close", () => {
  it("stays open while setup is preparing even after preflight finished", () => {
    assert.equal(
      canGameLauncherAutoClose({
        preflightFinished: true,
        isGeneratingAchievements: false,
        compatibilityLayerStatus: "preparing",
      }),
      false
    );
  });

  it("closes once setup is idle and nothing else is running", () => {
    assert.equal(
      canGameLauncherAutoClose({
        preflightFinished: true,
        isGeneratingAchievements: false,
        compatibilityLayerStatus: "idle",
      }),
      true
    );
    assert.equal(
      canGameLauncherAutoClose({
        preflightFinished: true,
        isGeneratingAchievements: false,
        compatibilityLayerStatus: "failed",
      }),
      false
    );
  });
});

describe("launch phases", () => {
  const idle = {
    preflightStatus: "idle",
    compatibilityLayerStatus: "idle" as const,
    achievementsExportStatus: "idle",
  };

  it("prefers dependencies, then the compatibility layer, then achievements", () => {
    assert.equal(getLaunchPhase(idle), "start");
    assert.equal(
      getLaunchPhase({
        ...idle,
        preflightStatus: "installing",
        compatibilityLayerStatus: "preparing",
      }),
      "dependencies"
    );
    assert.equal(
      getLaunchPhase({ ...idle, compatibilityLayerStatus: "failed" }),
      "compatibility"
    );
    assert.equal(
      getLaunchPhase({
        ...idle,
        achievementsExportStatus: "generating_achievements",
      }),
      "achievements"
    );
    assert.equal(
      getLaunchPhase({ ...idle, preflightStatus: "complete" }),
      "start"
    );
  });

  it("keeps seen phases in order and always ends with start", () => {
    let seen = addLaunchPhase(["start"], "start");
    assert.deepEqual(seen, ["start"]);

    seen = addLaunchPhase(seen, "compatibility");
    assert.deepEqual(seen, ["compatibility", "start"]);

    seen = addLaunchPhase(seen, "achievements");
    assert.deepEqual(seen, ["compatibility", "achievements", "start"]);

    assert.equal(addLaunchPhase(seen, "compatibility"), seen);
  });
});
