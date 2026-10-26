import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SteamWishlistEntry } from "@types";

import {
  isUsableStoreItem,
  toWishlistEntry,
  upcomingEntries,
  wishlistEvent,
} from "./steam-wishlist-core.js";

const NOW = 1_800_000_000;
const entry = (
  overrides: Partial<SteamWishlistEntry> = {}
): SteamWishlistEntry => ({
  appId: "1",
  name: "Game",
  dateAdded: 100,
  comingSoon: true,
  releaseDate: null,
  isEarlyAccess: false,
  checkedAt: 0,
  ...overrides,
});

describe("toWishlistEntry", () => {
  it("reads the coming soon flag and release date", () => {
    const result = toWishlistEntry(
      {
        success: 1,
        name: "Valley",
        is_coming_soon: true,
        release: { steam_release_date: 1_893_398_400 },
      },
      "5",
      42,
      NOW
    );
    assert.equal(result.comingSoon, true);
    assert.equal(result.releaseDate, 1_893_398_400);
    assert.equal(result.dateAdded, 42);
  });

  it("treats a released game as not coming soon", () => {
    const result = toWishlistEntry(
      {
        success: 1,
        name: "Uplink",
        release: { steam_release_date: 1_156_316_400 },
      },
      "1510",
      1,
      NOW
    );
    assert.equal(result.comingSoon, false);
  });
});

describe("isUsableStoreItem", () => {
  it("rejects empty and delisted items", () => {
    assert.equal(isUsableStoreItem({}), false);
    assert.equal(
      isUsableStoreItem({ success: 1, visible: false, name: "X" }),
      false
    );
    assert.equal(
      isUsableStoreItem({ success: 1, visible: true, name: "X" }),
      true
    );
  });
});

describe("wishlistEvent", () => {
  it("announces a release", () => {
    assert.equal(
      wishlistEvent(
        entry(),
        entry({ comingSoon: false, releaseDate: NOW - 60 }),
        NOW
      ),
      "released"
    );
  });

  it("does not announce a game it had never seen", () => {
    assert.equal(
      wishlistEvent(
        null,
        entry({ comingSoon: false, releaseDate: NOW - 60 }),
        NOW
      ),
      null
    );
  });

  it("does not announce when the store shows no date", () => {
    assert.equal(
      wishlistEvent(
        entry(),
        entry({ comingSoon: false, releaseDate: null }),
        NOW
      ),
      null
    );
  });

  it("announces a date appearing on an unannounced game", () => {
    assert.equal(
      wishlistEvent(entry(), entry({ releaseDate: NOW + 5_000_000 }), NOW),
      "date-announced"
    );
    assert.equal(
      wishlistEvent(
        entry({ releaseDate: NOW + 1 }),
        entry({ releaseDate: NOW + 5_000_000 }),
        NOW
      ),
      null
    );
  });

  it("stays quiet for games that were already out", () => {
    assert.equal(
      wishlistEvent(
        entry({ comingSoon: false }),
        entry({ comingSoon: false }),
        NOW
      ),
      null
    );
  });
});

describe("upcomingEntries", () => {
  it("keeps only coming soon games, newest wishlisted first", () => {
    const result = upcomingEntries([
      entry({ appId: "a", dateAdded: 1 }),
      entry({ appId: "b", dateAdded: 9 }),
      entry({ appId: "c", comingSoon: false }),
    ]);
    assert.deepEqual(
      result.map((item) => item.appId),
      ["b", "a"]
    );
  });
});
