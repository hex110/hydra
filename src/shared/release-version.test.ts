import { describe, it } from "node:test";
import assert from "node:assert";
import type { GameInstalledVersion } from "@types";
import {
  compareReleaseVersions,
  findAvailableUpdate,
  isNewerRelease,
  parseReleaseVersion,
} from "./release-version.js";

describe("parseReleaseVersion", () => {
  const cases: [string, string | null, string | null][] = [
    ["Cyberpunk.2077.v2.3-FitGirl", "2.3", null],
    ["Lost Soul Aside – V 1.103 / Build 22971784", "1.103", "22971784"],
    ["Escape Simulator 2 – V 22715r / Build 25386453", "22715r", "25386453"],
    ["Mini Motorways – Build 25381668", null, "25381668"],
    ["DMD.CH4-1.01-pc", "1.01", null],
    ["Elden Ring v1.12 + All DLCs - FitGirl Repack", "1.12", null],
    ["Grand Theft Auto V", null, null],
    ["Hades II [DODI Repack]", null, null],
    [
      "Survivalist: Invisible Strain – V 272 / Build 22802494",
      "272",
      "22802494",
    ],
    ["Game_v1_2_3", "1.2.3", null],
    ["Hades II [v 1.139251] (2025) PC | Portable", "1.139251", null],
    ["Stray [v 1.5#368] (2022) PC | RePack", "1.5", null],
    ["Dyson Sphere Program [v23350 | Early Access] (2021) PC", "23350", null],
    ["Mists of Noyah [P] [ENG + 8] (2022) (1.0.2) [Scene]", "1.0.2", null],
  ];

  for (const [name, version, build] of cases) {
    it(`reads ${JSON.stringify(name)}`, () => {
      assert.deepStrictEqual(parseReleaseVersion(name), { version, build });
    });
  }
});

describe("compareReleaseVersions", () => {
  it("compares versions part by part", () => {
    const v = (version: string) => ({ version, build: null });
    assert.ok(compareReleaseVersions(v("1.10"), v("1.9"))! > 0);
    assert.ok(compareReleaseVersions(v("1.2"), v("1.2.1"))! < 0);
    assert.strictEqual(compareReleaseVersions(v("1.2.0"), v("1.2")), 0);
    assert.ok(compareReleaseVersions(v("2.3b"), v("2.3a"))! > 0);
  });

  it("prefers builds when both have one", () => {
    assert.ok(
      compareReleaseVersions(
        { version: "1.0", build: "200" },
        { version: "1.1", build: "100" }
      )! > 0
    );
  });

  it("cannot compare a build with a version", () => {
    assert.strictEqual(
      compareReleaseVersions(
        { version: null, build: "200" },
        { version: "1.1", build: null }
      ),
      null
    );
  });
});

const installed = (
  title: string,
  extra: Partial<GameInstalledVersion> = {}
): GameInstalledVersion => ({
  title,
  downloadSourceId: "fitgirl",
  downloadSourceName: "FitGirl",
  uploadDate: "2026-01-01T00:00:00.000Z",
  fileSize: null,
  uris: [],
  directory: null,
  origin: "download",
  recordedAt: "2026-01-02T00:00:00.000Z",
  ...extra,
});

const repack = (
  title: string,
  downloadSourceId = "fitgirl",
  uploadDate: string | null = "2026-02-01T00:00:00.000Z"
) => ({ title, downloadSourceId, uploadDate, uris: [] as string[] });

describe("isNewerRelease", () => {
  it("compares versions in the names", () => {
    const current = installed("Brotato – v1.1.12.1 / Build 20236656");
    assert.ok(
      isNewerRelease(repack("Brotato – v1.1.13 / Build 21000000"), current)
    );
    assert.ok(
      !isNewerRelease(repack("Brotato – v1.1.11 / Build 19000000"), current)
    );
  });

  it("uses the upload date within the same source when versions are missing", () => {
    const current = installed("Hades II [DODI Repack]", {
      downloadSourceId: "dodi",
    });
    assert.ok(
      isNewerRelease(repack("Hades II [DODI Repack] Update", "dodi"), current)
    );
    assert.ok(!isNewerRelease(repack("Hades II [Other]", "other"), current));
  });

  it("does not compare differently shaped versions across sources", () => {
    const current = installed("Dyson Sphere Program – V 0.10.35.29104", {
      downloadSourceId: "anker",
    });
    assert.ok(
      !isNewerRelease(
        repack("Dyson Sphere Program [v23350 | Early Access]", "rutracker"),
        current
      )
    );
    assert.ok(
      isNewerRelease(
        repack("Dyson Sphere Program – V 0.10.36.1", "anker"),
        current
      )
    );
  });

  it("never treats the installed release as an update", () => {
    const current = installed("Game v1.0");
    assert.ok(!isNewerRelease(repack("Game v1.0"), current));
  });
});

describe("findAvailableUpdate", () => {
  it("prefers the installed release's source, then the highest version", () => {
    const current = installed("Game v1.0");
    const update = findAvailableUpdate(
      [
        repack("Game v1.5", "other"),
        repack("Game v1.2"),
        repack("Game v1.3"),
        repack("Game v0.9"),
      ],
      current,
      "Game"
    );
    assert.strictEqual(update?.title, "Game v1.3");
  });

  it("ignores other games and dismissed releases", () => {
    const current = installed("Game v1.0");
    assert.strictEqual(
      findAvailableUpdate(
        [repack("Game Soundtrack Collection v2.0"), repack("Game v1.1")],
        current,
        "Game",
        ["Game v1.1"]
      ),
      null
    );
  });

  it("accepts releases named after the store title", () => {
    const current = installed("GAME.FOLDER.v1.0", { origin: "folder" });
    assert.strictEqual(
      findAvailableUpdate([repack("The Game v1.1")], current, "The Game")
        ?.title,
      "The Game v1.1"
    );
  });
});
