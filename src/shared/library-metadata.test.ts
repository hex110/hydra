import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getEffectiveGenres,
  getGenreNames,
  getSteamTagNames,
  invertSteamTags,
  isLibraryMetadataStale,
  LIBRARY_METADATA_MAX_AGE_MS,
  LIBRARY_METADATA_VERSION,
  parseHowLongToBeat,
  parseHowLongToBeatDuration,
  parseReleaseDate,
} from "./library-metadata.js";

describe("parseHowLongToBeatDuration", () => {
  it("reads hours, half hours and minutes", () => {
    assert.equal(parseHowLongToBeatDuration("26 Hours"), 26);
    assert.equal(parseHowLongToBeatDuration("12½ Hours"), 12.5);
    assert.equal(parseHowLongToBeatDuration("½ Hours"), 0.5);
    assert.equal(parseHowLongToBeatDuration("45 Mins"), 0.75);
    assert.equal(parseHowLongToBeatDuration("1 Hour"), 1);
  });

  it("returns null for durations it can't read", () => {
    assert.equal(parseHowLongToBeatDuration("--"), null);
    assert.equal(parseHowLongToBeatDuration(""), null);
    assert.equal(parseHowLongToBeatDuration("0 Hours"), null);
  });
});

describe("parseHowLongToBeat", () => {
  it("maps the three categories", () => {
    assert.deepEqual(
      parseHowLongToBeat([
        { title: "Main Story", accuracy: "100", duration: "26 Hours" },
        { title: "Main + Sides", accuracy: "100", duration: "63 Hours" },
        { title: "Completionist", accuracy: "100", duration: "109 Hours" },
      ]),
      { mainStory: 26, mainExtra: 63, completionist: 109 }
    );
  });

  it("returns null without usable categories", () => {
    assert.equal(parseHowLongToBeat(null), null);
    assert.equal(parseHowLongToBeat([]), null);
    assert.equal(
      parseHowLongToBeat([{ title: "Co-Op", accuracy: "1", duration: "--" }]),
      null
    );
  });
});

describe("parseReleaseDate", () => {
  it("reads Steam and ISO dates", () => {
    assert.equal(
      parseReleaseDate("2020-12-09T00:00:00.000Z"),
      "2020-12-09T00:00:00.000Z"
    );
    assert.match(parseReleaseDate("Dec 9, 2020") ?? "", /^2020-12-0[89]/);
    assert.equal(parseReleaseDate("Coming soon"), null);
    assert.equal(parseReleaseDate(null), null);
  });
});

describe("getGenreNames", () => {
  it("accepts Steam, mapped and plain genres and drops duplicates", () => {
    assert.deepEqual(
      getGenreNames([
        { description: "RPG" },
        { name: "Action" },
        "Action",
        " ",
      ]),
      ["RPG", "Action"]
    );
    assert.deepEqual(getGenreNames(undefined), []);
  });
});

describe("getEffectiveGenres", () => {
  it("prefers the user's genres", () => {
    assert.deepEqual(
      getEffectiveGenres({
        customGenres: ["Roguelike"],
        metadata: { genres: ["Action"] },
      }),
      ["Roguelike"]
    );
    assert.deepEqual(
      getEffectiveGenres({
        customGenres: [],
        metadata: { genres: ["Action"] },
      }),
      ["Action"]
    );
    assert.deepEqual(getEffectiveGenres({}), []);
  });
});

describe("getSteamTagNames", () => {
  const names = invertSteamTags({
    "Souls-like": 29482,
    RPG: 122,
    Atmospheric: 4166,
  });

  it("maps ids to names in order and drops unknown ids and duplicates", () => {
    assert.deepEqual(getSteamTagNames(["29482", 999, 122, "122"], names), [
      "Souls-like",
      "RPG",
    ]);
  });

  it("keeps only the most voted tags", () => {
    assert.deepEqual(getSteamTagNames(["29482", "122", "4166"], names, 2), [
      "Souls-like",
      "RPG",
    ]);
  });

  it("returns nothing without tags", () => {
    assert.deepEqual(getSteamTagNames(undefined, names), []);
    assert.deepEqual(getSteamTagNames(["1"], invertSteamTags(null)), []);
  });
});

describe("isLibraryMetadataStale", () => {
  it("is stale when missing or older than the max age", () => {
    const now = 10 * LIBRARY_METADATA_MAX_AGE_MS;
    assert.equal(isLibraryMetadataStale(null, now), true);
    assert.equal(
      isLibraryMetadataStale(
        { fetchedAt: now - 1000, version: LIBRARY_METADATA_VERSION },
        now
      ),
      false
    );
    assert.equal(
      isLibraryMetadataStale(
        {
          fetchedAt: now - LIBRARY_METADATA_MAX_AGE_MS - 1,
          version: LIBRARY_METADATA_VERSION,
        },
        now
      ),
      true
    );
  });

  it("is stale when fetched before the current metadata version", () => {
    assert.equal(isLibraryMetadataStale({ fetchedAt: 1000 }, 2000), true);
  });
});
