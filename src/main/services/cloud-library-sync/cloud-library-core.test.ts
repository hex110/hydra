import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildDeviceCollections,
  buildDeviceGames,
  buildLibraryEntries,
  planLibraryImport,
  planMerge,
  type SyncedCollection,
  unionAchievements,
  type LibrarySourceGame,
  type LibraryState,
  type DeviceGameState,
  type DeviceState,
  type LocalGameView,
} from "./cloud-library-core.ts";
import { LEGACY_EDIT_STAMP } from "./profile-fields.ts";

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

describe("profile fields", () => {
  const T1 = "2026-10-01T00:00:00.000Z";
  const T2 = "2026-10-02T00:00:00.000Z";

  it("publishes a field with its edit date, or the legacy date when it was never dated", () => {
    const states = buildDeviceGames([
      {
        shop: "steam",
        objectId: "1",
        title: "Edited",
        isDeleted: false,
        notes: "good",
        profileEditedAt: { notes: T1 },
      },
      {
        shop: "steam",
        objectId: "2",
        title: "Old notes",
        isDeleted: false,
        rating: 8,
      },
      { shop: "steam", objectId: "3", title: "Nothing", isDeleted: false },
    ]);

    assert.deepEqual(states["steam:1"].profile, { notes: "good" });
    assert.deepEqual(states["steam:1"].profileEditedAt, { notes: T1 });
    assert.deepEqual(states["steam:2"].profile, { rating: 8 });
    assert.deepEqual(states["steam:2"].profileEditedAt, {
      rating: LEGACY_EDIT_STAMP,
    });
    assert.equal(states["steam:3"], undefined);
  });

  it("takes another device's newer edit and keeps this device's newer one", () => {
    const other = device("b", {
      "steam:620": {
        title: "Portal 2",
        profile: { notes: "from b", rating: 4 },
        profileEditedAt: { notes: T2, rating: T1 },
      },
    });

    const actions = planMerge(
      views(
        local({
          notes: "from a",
          rating: 9,
          profileEditedAt: { notes: T1, rating: T2 },
        })
      ),
      [other]
    );

    assert.deepEqual(actions, [
      {
        kind: "patch",
        key: "steam:620",
        patch: {
          notes: "from b",
          profileEditedAt: { notes: T2, rating: T2 },
        },
      },
    ]);
  });

  it("adopts a value that was set before edits were dated, but not over a local one", () => {
    const other = device("b", {
      "steam:620": {
        title: "Portal 2",
        profile: { notes: "old note", rating: 5 },
        profileEditedAt: {
          notes: LEGACY_EDIT_STAMP,
          rating: LEGACY_EDIT_STAMP,
        },
      },
    });

    const [action] = planMerge(views(local({ rating: 7 })), [other]);

    assert.deepEqual(action, {
      kind: "patch",
      key: "steam:620",
      patch: {
        notes: "old note",
        profileEditedAt: { notes: LEGACY_EDIT_STAMP },
      },
    });
  });

  it("clears a field that was cleared on the newest edit", () => {
    const other = device("b", {
      "steam:620": {
        title: "Portal 2",
        profile: { notes: null },
        profileEditedAt: { notes: T2 },
      },
    });

    const [action] = planMerge(
      views(local({ notes: "stale", profileEditedAt: { notes: T1 } })),
      [other]
    );

    assert.deepEqual(action, {
      kind: "patch",
      key: "steam:620",
      patch: { notes: null, profileEditedAt: { notes: T2 } },
    });
  });

  it("says nothing when the devices already agree", () => {
    const other = device("b", {
      "steam:620": {
        title: "Portal 2",
        profile: { notes: "same", favorite: false },
        profileEditedAt: { notes: T1, favorite: T1 },
      },
    });

    assert.deepEqual(
      planMerge(
        views(local({ notes: "same", profileEditedAt: { notes: T2 } })),
        [other]
      ),
      []
    );
  });
});

describe("achievements", () => {
  const unlock = (name: string, unlockTime: number) => ({ name, unlockTime });

  it("publishes a game's unlocks even with no playtime, once", () => {
    const states = buildDeviceGames(
      [{ shop: "steam", objectId: "1", title: "G", isDeleted: false }],
      new Map([["steam:1", [unlock("a", 5), unlock("A", 3)]]])
    );

    assert.deepEqual(states["steam:1"].achievements, [unlock("A", 3)]);
  });

  it("keeps the earliest unlock and the hardcore time when merging lists", () => {
    assert.deepEqual(
      unionAchievements(
        [{ name: "x", unlockTime: 9 }],
        [{ name: "X", unlockTime: 4, hardcoreUnlockTime: 4 }]
      ),
      [{ name: "X", unlockTime: 4, hardcoreUnlockTime: 4 }]
    );
  });

  it("plans only the unlocks this device has not read", () => {
    const other = device("b", {
      "steam:620": {
        title: "Portal 2",
        achievements: [unlock("ONE", 1), unlock("TWO", 2)],
      },
    });

    assert.deepEqual(
      planMerge(views(local({ unlockedAchievementNames: ["ONE"] })), [other]),
      [
        {
          kind: "achievements",
          key: "steam:620",
          achievements: [unlock("TWO", 2)],
        },
      ]
    );
  });

  it("waits until this device has read its achievements, and skips Epic and wishes", () => {
    const states = {
      "steam:620": { title: "Portal 2", achievements: [unlock("ONE", 1)] },
      "epic:620": { title: "Portal 2", achievements: [unlock("ONE", 1)] },
    };
    const other = device("b", states);

    assert.deepEqual(planMerge(views(local()), [other]), []);
    assert.deepEqual(
      planMerge(
        views(
          local({ shop: "epic", unlockedAchievementNames: [] }),
          local({ wishlistOnly: true, unlockedAchievementNames: [] })
        ),
        [other]
      ),
      []
    );
  });
});

describe("library list", () => {
  const entry = (objectId: string, extra = {}) => ({
    shop: "steam" as const,
    objectId,
    title: `Game ${objectId}`,
    platform: null,
    addedToLibraryAt: null,
    ...extra,
  });
  const library = (deviceId: string, ...games: LibraryState["games"]) => ({
    version: 1 as const,
    deviceId,
    hostname: deviceId,
    updatedAt: "2026-10-28T00:00:00.000Z",
    games,
  });

  it("lists the library, not removed, wished-for or custom games", () => {
    const games: Partial<LibrarySourceGame>[] = [
      { shop: "steam", objectId: "1", title: "B" },
      { shop: "steam", objectId: "2", title: "A", isDeleted: true },
      { shop: "steam", objectId: "3", title: "C", wishlistOnly: true },
      { shop: "custom", objectId: "4", title: "D" },
      { shop: "epic", objectId: "5", title: "A2" },
    ];
    const entries = buildLibraryEntries(
      games.map((game) => ({
        isDeleted: false,
        wishlistOnly: false,
        platform: null,
        addedToLibraryAt: new Date("2026-10-01T00:00:00Z"),
        ...game,
      })) as LibrarySourceGame[]
    );

    assert.deepEqual(
      entries.map((game) => game.objectId),
      ["5", "1"]
    );
    assert.equal(entries[0].addedToLibraryAt, "2026-10-01T00:00:00.000Z");
  });

  it("offers each missing game once, with the earliest date, and none this library has", () => {
    const missing = planLibraryImport(new Set(["steam:1"]), [
      library("a", entry("1"), entry("2", { addedToLibraryAt: "2026-10-05" })),
      library("b", entry("2", { addedToLibraryAt: "2026-10-01" }), entry("3")),
    ]);

    assert.deepEqual(
      missing.map((game) => [game.objectId, game.addedToLibraryAt]),
      [
        ["2", "2026-10-01"],
        ["3", null],
      ]
    );
  });
});

describe("collections", () => {
  const T1 = "2026-10-01T00:00:00.000Z";
  const T2 = "2026-10-02T00:00:00.000Z";
  const collection = (
    name: string,
    updatedAt = T1,
    extra: Partial<SyncedCollection> = {}
  ): SyncedCollection => ({ name, createdAt: T1, updatedAt, ...extra });
  const withCollections = (
    deviceId: string,
    collections: Record<string, SyncedCollection>,
    games: Record<string, DeviceGameState> = {}
  ) => ({ ...device(deviceId, games), collections });
  const here = (...items: [string, SyncedCollection][]) => new Map(items);

  it("publishes the collections, deleted ones as markers, and each game's local ones", () => {
    assert.deepEqual(
      buildDeviceCollections([
        { id: "local-a", name: "RPGs", createdAt: T1 },
        {
          id: "local-b",
          name: "Old",
          createdAt: T1,
          updatedAt: T2,
          deleted: true,
        },
      ]),
      {
        "local-a": {
          name: "RPGs",
          createdAt: T1,
          savedFilter: null,
          updatedAt: T1,
        },
        "local-b": {
          name: "Old",
          createdAt: T1,
          savedFilter: null,
          updatedAt: T2,
          deleted: true,
        },
      }
    );

    const states = buildDeviceGames([
      {
        shop: "steam",
        objectId: "1",
        title: "G",
        isDeleted: false,
        collectionIds: ["local-a", "5f0c-account"],
      },
    ]);
    assert.deepEqual(states["steam:1"].collections, ["local-a"]);
  });

  it("creates a collection another device made, once, and not one it deleted", () => {
    const other = withCollections("b", {
      "local-new": collection("Co-op"),
      "local-gone": collection("Gone", T1, { deleted: true }),
    });

    assert.deepEqual(planMerge(views(), [other], here()), [
      { kind: "collection", id: "local-new", collection: collection("Co-op") },
    ]);
  });

  it("follows the newest change: a rename and a delete win over an older copy", () => {
    const other = withCollections("b", {
      "local-a": collection("RPG", T2),
      "local-b": collection("Old", T2, { deleted: true }),
      "local-c": collection("Mine", T1),
    });

    const actions = planMerge(
      views(),
      [other],
      here(
        ["local-a", collection("RPGs", T1)],
        ["local-b", collection("Old", T1)],
        ["local-c", collection("Mine kept", T2)]
      )
    );

    assert.deepEqual(actions, [
      { kind: "collection", id: "local-a", collection: collection("RPG", T2) },
      {
        kind: "collection",
        id: "local-b",
        collection: collection("Old", T2, { deleted: true }),
      },
    ]);
  });

  it("treats a collection with the same name as the one here, and maps its games onto it", () => {
    const other = withCollections(
      "b",
      { "local-remote": collection("RPGs") },
      {
        "steam:620": {
          title: "Portal 2",
          collections: ["local-remote"],
          profileEditedAt: { collections: T2 },
        },
      }
    );

    const actions = planMerge(
      views(local()),
      [other],
      here(["local-mine", collection("rpgs")])
    );

    assert.deepEqual(actions, [
      {
        kind: "patch",
        key: "steam:620",
        patch: {
          collectionIds: ["local-mine"],
          profileEditedAt: { collections: T2 },
        },
      },
    ]);
  });

  it("keeps account collections and takes the newer membership, but never a deleted collection", () => {
    const other = withCollections(
      "b",
      {
        "local-a": collection("A"),
        "local-b": collection("B", T2, { deleted: true }),
      },
      {
        "steam:620": {
          title: "Portal 2",
          collections: ["local-a", "local-b"],
          profileEditedAt: { collections: T2 },
        },
      }
    );

    const [action] = planMerge(
      views(
        local({
          collectionIds: ["account-1"],
          profileEditedAt: { collections: T1 },
        })
      ),
      [other],
      here(["local-a", collection("A")], ["local-b", collection("B")])
    ).filter((candidate) => candidate.kind === "patch");

    assert.deepEqual(action, {
      kind: "patch",
      key: "steam:620",
      patch: {
        collectionIds: ["account-1", "local-a"],
        profileEditedAt: { collections: T2 },
      },
    });
  });

  it("leaves a newer local membership alone", () => {
    const other = withCollections(
      "b",
      { "local-a": collection("A") },
      {
        "steam:620": {
          title: "Portal 2",
          collections: ["local-a"],
          profileEditedAt: { collections: T1 },
        },
      }
    );

    assert.deepEqual(
      planMerge(
        views(
          local({ collectionIds: [], profileEditedAt: { collections: T2 } })
        ),
        [other],
        here(["local-a", collection("A")])
      ),
      []
    );
  });
});
