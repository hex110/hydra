import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isNotificationPreferenceEnabled,
  notificationTargetBigPicturePath,
  notificationTargetPath,
  summarizeTitles,
} from "./notification-targets.js";

const game = (objectId: string) => ({
  shop: "steam" as const,
  objectId,
  title: `Game ${objectId}`,
  iconUrl: null,
});

describe("notificationTargetPath", () => {
  it("opens a game page, and a game options section when one is named", () => {
    assert.equal(
      notificationTargetPath({ kind: "game", shop: "steam", objectId: "10" }),
      "/game/steam/10"
    );
    assert.equal(
      notificationTargetPath({
        kind: "game",
        shop: "steam",
        objectId: "10",
        section: "optiscaler",
      }),
      "/game/steam/10?options=optiscaler"
    );
  });

  it("opens the one game of a single-game list", () => {
    assert.equal(
      notificationTargetPath({ kind: "games", games: [game("20")] }, "abc"),
      "/game/steam/20"
    );
  });

  it("opens the inbox entry of a list of several games, not a whole collection", () => {
    assert.equal(
      notificationTargetPath(
        { kind: "games", games: [game("1"), game("2"), game("3")] },
        "abc"
      ),
      "/notifications?highlight=abc"
    );
  });

  it("encodes ids that are not URL-safe", () => {
    assert.equal(
      notificationTargetPath({
        kind: "game",
        shop: "custom",
        objectId: "a/b c",
      }),
      "/game/custom/a%2Fb%20c"
    );
  });

  it("opens the achievements page with the game in the query", () => {
    const path = notificationTargetPath({
      kind: "achievements",
      shop: "steam",
      objectId: "30",
      title: "Thirty & Co",
    });
    const url = new URL(path, "http://x");
    assert.equal(url.pathname, "/achievements/");
    assert.equal(url.searchParams.get("objectId"), "30");
    assert.equal(url.searchParams.get("title"), "Thirty & Co");
  });
});

describe("notificationTargetBigPicturePath", () => {
  it("maps routes Big Picture has and drops the query", () => {
    assert.equal(
      notificationTargetBigPicturePath({
        kind: "game",
        shop: "steam",
        objectId: "10",
        section: "tools",
      }),
      "/big-picture/game/steam/10"
    );
    assert.equal(
      notificationTargetBigPicturePath({ kind: "downloads" }),
      "/big-picture/downloads"
    );
  });

  it("has no route for the inbox or unknown pages", () => {
    assert.equal(
      notificationTargetBigPicturePath({
        kind: "games",
        games: [game("1"), game("2")],
      }),
      null
    );
    assert.equal(
      notificationTargetBigPicturePath({ kind: "path", path: "/mods?x=1" }),
      null
    );
  });
});

describe("isNotificationPreferenceEnabled", () => {
  it("uses the switch when set and the shared default otherwise", () => {
    assert.equal(
      isNotificationPreferenceEnabled(
        null,
        "friendRequestNotificationsEnabled"
      ),
      false
    );
    assert.equal(
      isNotificationPreferenceEnabled(null, "gameUpdateNotificationsEnabled"),
      true
    );
    assert.equal(
      isNotificationPreferenceEnabled(
        { gameUpdateNotificationsEnabled: false },
        "gameUpdateNotificationsEnabled"
      ),
      false
    );
  });
});

describe("summarizeTitles", () => {
  it("only says there are more when some titles were left out", () => {
    assert.deepEqual(summarizeTitles(["A", "B", "C"]), {
      titles: "A, B, C",
      hasMore: false,
    });
    assert.deepEqual(summarizeTitles(["A", "B", "C", "D"]), {
      titles: "A, B, C",
      hasMore: true,
    });
  });
});
