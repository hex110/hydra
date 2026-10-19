import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildAchievementNotificationInfo } from "./achievement-notification-info.ts";

const metadata = {
  name: "ACH_ONE",
  displayName: "First Blood",
  description: "Win your first match",
  icon: "https://cdn.example/ach_one.jpg",
  icongray: "https://cdn.example/ach_one_gray.jpg",
  hidden: false,
  points: 100,
};

describe("buildAchievementNotificationInfo", () => {
  it("uses the catalogue entry when there is one", () => {
    const [info] = buildAchievementNotificationInfo({
      newAchievements: [{ name: "ach_one", unlockTime: 1 }],
      achievementsData: [metadata],
      previouslyUnlockedCount: 0,
      fallbackIconUrl: "game.png",
    });

    assert.equal(info.title, "First Blood");
    assert.equal(info.iconUrl, "https://cdn.example/ach_one.jpg");
    assert.equal(info.points, 100);
    assert.equal(info.isPlatinum, true);
  });

  it("keeps unlocks the catalogue doesn't know, with the game icon", () => {
    const result = buildAchievementNotificationInfo({
      newAchievements: [
        { name: "ACH_UNKNOWN", unlockTime: 2 },
        { name: "ACH_ONE", unlockTime: 1 },
      ],
      achievementsData: [metadata],
      previouslyUnlockedCount: 0,
      fallbackIconUrl: "game.png",
    });

    assert.deepEqual(
      result.map((info) => [info.title, info.iconUrl]),
      [
        ["First Blood", "https://cdn.example/ach_one.jpg"],
        ["ACH_UNKNOWN", "game.png"],
      ]
    );
    assert.equal(result[1].isHidden, false);
    assert.equal(result[1].isRare, false);
  });
});
