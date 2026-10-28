import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildDeviceGames,
  planMerge,
  type DeviceGameState,
  type DeviceState,
  type LocalGameView,
} from "./cloud-library-core.ts";

const device = (
  deviceId: string,
  games: Record<string, DeviceGameState>
): DeviceState => ({
  version: 1,
  deviceId,
  hostname: deviceId,
  platform: "linux",
  updatedAt: "2026-10-28T00:00:00.000Z",
  games,
});

const local = (overrides: Partial<LocalGameView> = {}): LocalGameView => ({
  shop: "steam",
  objectId: "620",
  title: "Portal 2",
  isDeleted: false,
  wishlistOnly: false,
  ...overrides,
});

const views = (...items: LocalGameView[]) =>
  new Map(items.map((item) => [`${item.shop}:${item.objectId}`, item]));

describe("buildDeviceGames", () => {
  it("lists games with playtime, a status or a wish, and skips the rest", () => {
    const games = buildDeviceGames([
      {
        shop: "steam",
        objectId: "1",
        title: "Played",
        isDeleted: false,
        playTimeInMilliseconds: 3_600_000,
        lastTimePlayed: new Date("2026-10-01T10:00:00Z"),
      },
      {
        shop: "steam",
        objectId: "2",
        title: "Idle",
        isDeleted: false,
        playTimeInMilliseconds: 0,
      },
      {
        shop: "custom",
        objectId: "x",
        title: "Local only",
        isDeleted: false,
        playTimeInMilliseconds: 5_000,
      },
      {
        shop: "steam",
        objectId: "3",
        title: "Dropped wish",
        isDeleted: true,
        playTimeInMilliseconds: 0,
        wishlisted: false,
        wishlistedUpdatedAt: "2026-10-02T00:00:00.000Z",
      },
    ]);

    assert.deepEqual(Object.keys(games), ["steam:1", "steam:3"]);
    assert.equal(games["steam:1"].playTimeInMilliseconds, 3_600_000);
    assert.equal(games["steam:3"].wishlisted, false);
  });
});

describe("planMerge", () => {
  it("adds up the playtime of the other devices", () => {
    const actions = planMerge(views(local()), [
      device("a", {
        "steam:620": { title: "Portal 2", playTimeInMilliseconds: 60_000 },
      }),
      device("b", {
        "steam:620": { title: "Portal 2", playTimeInMilliseconds: 30_000 },
      }),
    ]);

    assert.deepEqual(actions, [
      {
        kind: "patch",
        key: "steam:620",
        patch: { syncedPlayTimeInMilliseconds: 90_000 },
      },
    ]);
  });

  it("does nothing when everything already agrees", () => {
    const actions = planMerge(
      views(local({ syncedPlayTimeInMilliseconds: 60_000 })),
      [
        device("a", {
          "steam:620": { title: "Portal 2", playTimeInMilliseconds: 60_000 },
        }),
      ]
    );
    assert.deepEqual(actions, []);
  });

  it("takes the most recent status", () => {
    const base = { title: "Portal 2" };
    const actions = planMerge(
      views(
        local({
          playStatus: "playing",
          playStatusUpdatedAt: "2026-10-10T00:00:00.000Z",
        })
      ),
      [
        device("a", {
          "steam:620": {
            ...base,
            playStatus: "finished",
            playStatusUpdatedAt: "2026-10-12T00:00:00.000Z",
          },
        }),
        device("b", {
          "steam:620": {
            ...base,
            playStatus: "dropped",
            playStatusUpdatedAt: "2026-10-11T00:00:00.000Z",
          },
        }),
      ]
    );

    assert.deepEqual(actions, [
      {
        kind: "patch",
        key: "steam:620",
        patch: {
          playStatus: "finished",
          playStatusUpdatedAt: "2026-10-12T00:00:00.000Z",
        },
      },
    ]);
  });

  it("keeps a local status that is newer than the others", () => {
    const actions = planMerge(
      views(
        local({
          playStatus: "finished",
          playStatusUpdatedAt: "2026-10-12T00:00:00.000Z",
        })
      ),
      [
        device("a", {
          "steam:620": {
            title: "Portal 2",
            playStatus: "playing",
            playStatusUpdatedAt: "2026-10-10T00:00:00.000Z",
          },
        }),
      ]
    );
    assert.deepEqual(actions, []);
  });

  it("lets a cleared status win when it is the newest edit", () => {
    const actions = planMerge(
      views(
        local({
          playStatus: "playing",
          playStatusUpdatedAt: "2026-10-10T00:00:00.000Z",
        })
      ),
      [
        device("a", {
          "steam:620": {
            title: "Portal 2",
            playStatus: null,
            playStatusUpdatedAt: "2026-10-11T00:00:00.000Z",
          },
        }),
      ]
    );
    assert.equal(actions.length, 1);
    assert.equal(
      (actions[0] as { patch: { playStatus: unknown } }).patch.playStatus,
      null
    );
  });

  it("adds a wishlisted game that this device has never seen", () => {
    const actions = planMerge(new Map(), [
      device("a", {
        "steam:730": {
          title: "Counter-Strike 2",
          platform: "windows",
          wishlisted: true,
          wishlistedUpdatedAt: "2026-10-12T00:00:00.000Z",
        },
      }),
    ]);

    assert.deepEqual(actions, [
      {
        kind: "createWishlist",
        shop: "steam",
        objectId: "730",
        title: "Counter-Strike 2",
        platform: "windows",
        stamp: "2026-10-12T00:00:00.000Z",
      },
    ]);
  });

  it("does not add a game that was only ever un-wished elsewhere", () => {
    const actions = planMerge(new Map(), [
      device("a", {
        "steam:730": {
          title: "Counter-Strike 2",
          wishlisted: false,
          wishlistedUpdatedAt: "2026-10-12T00:00:00.000Z",
        },
      }),
    ]);
    assert.deepEqual(actions, []);
  });

  it("drops a wish another device removed, and the entry when it was only a wish", () => {
    const drop = planMerge(
      views(
        local({
          wishlisted: true,
          wishlistedUpdatedAt: "2026-10-01T00:00:00.000Z",
          wishlistOnly: true,
        })
      ),
      [
        device("a", {
          "steam:620": {
            title: "Portal 2",
            wishlisted: false,
            wishlistedUpdatedAt: "2026-10-02T00:00:00.000Z",
          },
        }),
      ]
    );
    assert.deepEqual(drop, [
      {
        kind: "dropWishlist",
        key: "steam:620",
        stamp: "2026-10-02T00:00:00.000Z",
        deleteEntry: true,
      },
    ]);

    const keep = planMerge(
      views(
        local({
          wishlisted: true,
          wishlistedUpdatedAt: "2026-10-01T00:00:00.000Z",
          wishlistOnly: false,
        })
      ),
      [
        device("a", {
          "steam:620": {
            title: "Portal 2",
            wishlisted: false,
            wishlistedUpdatedAt: "2026-10-02T00:00:00.000Z",
          },
        }),
      ]
    );
    assert.deepEqual(keep, [
      {
        kind: "patch",
        key: "steam:620",
        patch: {
          wishlisted: false,
          wishlistedUpdatedAt: "2026-10-02T00:00:00.000Z",
        },
      },
    ]);
  });

  it("moves the last played date forward only", () => {
    const newer = planMerge(
      views(local({ lastTimePlayed: new Date("2026-10-01T00:00:00Z") })),
      [
        device("a", {
          "steam:620": {
            title: "Portal 2",
            lastTimePlayed: "2026-10-05T00:00:00.000Z",
          },
        }),
      ]
    );
    assert.equal(newer.length, 1);

    const older = planMerge(
      views(local({ lastTimePlayed: new Date("2026-10-09T00:00:00Z") })),
      [
        device("a", {
          "steam:620": {
            title: "Portal 2",
            lastTimePlayed: "2026-10-05T00:00:00.000Z",
          },
        }),
      ]
    );
    assert.deepEqual(older, []);
  });

  it("leaves a wish-only entry's playtime alone", () => {
    const actions = planMerge(
      views(local({ wishlisted: true, wishlistOnly: true })),
      [
        device("a", {
          "steam:620": { title: "Portal 2", playTimeInMilliseconds: 5_000 },
        }),
      ]
    );
    assert.deepEqual(actions, []);
  });
});
