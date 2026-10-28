import { describe, it } from "node:test";
import assert from "node:assert";
import type { GameRepack } from "@types";
import {
  parseRepackSize,
  rankRepacks,
  resolveRepackPreferences,
} from "./repack-ranking.js";

const repack = (
  id: string,
  source: string,
  size: string | null,
  date: string | null,
  title = id
): GameRepack => ({
  id,
  title,
  fileSize: size,
  uris: [`magnet:?xt=${id}`],
  unavailableUris: [],
  uploadDate: date,
  downloadSourceId: source,
  downloadSourceName: source,
  createdAt: "2026-01-01",
});

const repacks = [
  repack("old-fitgirl", "fitgirl", "40 GB", "2026-01-01"),
  repack("new-fitgirl", "fitgirl", "45 GB", "2026-09-01"),
  repack("anker", "anker", "60 GB", "2026-10-01"),
  repack("dodi", "dodi", "30 GB", "2026-05-01"),
  repack("mac", "anker", "20 GB", "2026-10-10", "Game (macOS)"),
];

describe("rankRepacks", () => {
  it("puts preferred sources first, then the newest", () => {
    const ranked = rankRepacks(
      repacks,
      resolveRepackPreferences({ preferredDownloadSourceIds: ["fitgirl"] })
    );
    assert.deepStrictEqual(
      ranked.map((item) => item.id),
      ["new-fitgirl", "old-fitgirl", "mac", "anker", "dodi"]
    );
  });

  it("can prefer the smallest and skip excluded words and big releases", () => {
    const ranked = rankRepacks(
      repacks,
      resolveRepackPreferences({
        repackSortPreference: "smallest",
        repackExcludedWords: "macOS, linux",
        repackMaxSizeInGigabytes: 50,
      })
    );
    assert.deepStrictEqual(
      ranked.map((item) => item.id),
      ["dodi", "old-fitgirl", "new-fitgirl"]
    );
  });

  it("puts the built-in AnkerGames source first unless the order lists it", () => {
    const builtIn = repack("builtin", "ankergames", "61 GB", "2026-01-01");
    const ranked = rankRepacks(
      [...repacks, builtIn],
      resolveRepackPreferences({ preferredDownloadSourceIds: ["fitgirl"] })
    );
    assert.strictEqual(ranked[0].id, "builtin");

    const listed = rankRepacks(
      [...repacks, builtIn],
      resolveRepackPreferences({
        preferredDownloadSourceIds: ["fitgirl", "ankergames"],
      })
    );
    assert.deepStrictEqual(
      listed.slice(0, 3).map((item) => item.id),
      ["new-fitgirl", "old-fitgirl", "builtin"]
    );
  });

  it("drops repacks the user cannot download", () => {
    const ranked = rankRepacks(
      repacks,
      resolveRepackPreferences(null),
      (item) => item.downloadSourceId !== "anker"
    );
    assert.strictEqual(ranked[0].id, "new-fitgirl");
    assert.ok(ranked.every((item) => item.downloadSourceId !== "anker"));
  });
});

describe("parseRepackSize", () => {
  it("reads common size formats", () => {
    assert.strictEqual(parseRepackSize("1 KB"), 1024);
    assert.strictEqual(parseRepackSize("1,5 GiB"), 1.5 * 1024 ** 3);
    assert.strictEqual(parseRepackSize("unknown"), null);
    assert.strictEqual(parseRepackSize(null), null);
  });
});
