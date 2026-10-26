import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Game } from "@types";
import { isImportedEntry, isUntouchedImport } from "./imported-games.js";

const imported = (patch: Partial<Game> = {}): Game => ({
  title: "Hades",
  iconUrl: null,
  libraryHeroImageUrl: null,
  logoImageUrl: null,
  objectId: "1145360",
  shop: "steam",
  remoteId: null,
  isDeleted: false,
  playTimeInMilliseconds: 0,
  lastTimePlayed: null,
  steamHistoryImported: true,
  ...(patch as object),
});

describe("isUntouchedImport", () => {
  it("accepts an entry the import created and nobody touched", () => {
    assert.equal(isUntouchedImport(imported(), "steam-history"), true);
  });

  it("only matches the source that created the entry", () => {
    assert.equal(isUntouchedImport(imported(), "floppy"), false);
    assert.equal(isUntouchedImport(imported(), "steam-wishlist"), false);
  });

  it("keeps entries the user made their own", () => {
    for (const patch of [
      { executablePath: "/games/hades/Hades.exe" },
      { remoteId: "abc" },
      { favorite: true },
      { isPinned: true },
      { notes: "finish the run" },
      { collectionIds: ["roguelikes"] },
      { customCoverImageUrl: "local:/cover.png" },
      { playTimeInMilliseconds: 60_000 },
      { isDeleted: true },
    ] satisfies Partial<Game>[]) {
      assert.equal(
        isUntouchedImport(imported(patch), "steam-history"),
        false,
        JSON.stringify(patch)
      );
    }
  });

  it("ignores data that came from Steam or Floppy, not the user", () => {
    assert.equal(
      isUntouchedImport(
        imported({
          steamPlayTimeInMilliseconds: 3_600_000,
          playStatus: "finished",
          rating: 8,
          floppyMediaId: "1234",
        }),
        "steam-history"
      ),
      true
    );
  });
});

describe("isImportedEntry", () => {
  it("is false once the flags are cleared", () => {
    assert.equal(isImportedEntry(imported()), true);
    assert.equal(
      isImportedEntry(imported({ steamHistoryImported: false })),
      false
    );
  });
});
