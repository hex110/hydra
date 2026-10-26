import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getCompletionSuggestion } from "./completion-suggestion.js";

const base = {
  playTimeInMilliseconds: 0,
  unlockedAchievements: 0,
  totalAchievements: 0,
};

describe("getCompletionSuggestion", () => {
  it("offers Finished at 100 % achievements", () => {
    assert.equal(
      getCompletionSuggestion({
        ...base,
        unlockedAchievements: 31,
        totalAchievements: 31,
      }),
      "achievements"
    );
  });

  it("does not treat a game without achievements as complete", () => {
    assert.equal(getCompletionSuggestion(base), null);
  });

  it("offers Finished once the main story length is played", () => {
    const twelveHours = 12 * 3_600_000;
    assert.equal(
      getCompletionSuggestion({
        ...base,
        playTimeInMilliseconds: twelveHours,
        mainStoryHours: 12,
      }),
      "story"
    );
    assert.equal(
      getCompletionSuggestion({
        ...base,
        playTimeInMilliseconds: twelveHours - 1,
        mainStoryHours: 12,
      }),
      null
    );
  });

  it("ignores implausibly short story lengths", () => {
    assert.equal(
      getCompletionSuggestion({
        ...base,
        playTimeInMilliseconds: 3_600_000,
        mainStoryHours: 0.5,
      }),
      null
    );
  });

  it("stays quiet for finished, dropped and dismissed games", () => {
    const ready = {
      ...base,
      unlockedAchievements: 5,
      totalAchievements: 5,
    };
    assert.equal(
      getCompletionSuggestion({ ...ready, playStatus: "finished" }),
      null
    );
    assert.equal(
      getCompletionSuggestion({ ...ready, playStatus: "dropped" }),
      null
    );
    assert.equal(getCompletionSuggestion({ ...ready, dismissed: true }), null);
    assert.equal(
      getCompletionSuggestion({ ...ready, playStatus: "playing" }),
      "achievements"
    );
  });
});
