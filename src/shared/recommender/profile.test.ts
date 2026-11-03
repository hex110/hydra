import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-ignore The Node ESM test runner requires the source extension.
import * as profileModule from "./profile.ts";
// @ts-ignore The Node ESM test runner requires the source extension.
import * as typesModule from "./types.ts";
// @ts-ignore The Node ESM test runner requires the source extension.
import * as storeGames from "../store-games.ts";

const { buildTasteProfile } = profileModule;
const { DEFAULT_TUNE_OPTIONS } = typesModule;
const { IDLE_TAG_IDS } = storeGames;

const IDLER = 615955;
const CLICKER = 379975;
const INCREMENTAL = 560542;
const CASUAL = 597;
const INDIE = 492;
const ACTION = 19;
const ROGUELIKE = 1716;
const ACTION_ROGUELIKE = 42804;
const PIXEL = 3964;
const DIFFICULT = 4026;
const METROIDVANIA = 1628;
const PLATFORMER = 1625;
const HACK = 1646;
const ATMOSPHERIC = 4166;

const tags = (...ids: number[]) =>
  ids.map((tagid, index) => ({ tagid, weight: 1000 - index * 40 }));

const seed = (key: string, hours: number, tagIds: number[], over = {}) => ({
  key: `steam:${key}`,
  appId: key,
  title: key,
  hours,
  recentHours: 0,
  rating: null,
  status: null,
  wishlisted: false,
  tags: tags(...tagIds),
  ...over,
});

const clicker = seed("Clicker Heroes", 3000, [
  IDLER,
  CLICKER,
  INCREMENTAL,
  CASUAL,
  INDIE,
  PIXEL,
]);
const hades = seed("Hades", 80, [
  ACTION_ROGUELIKE,
  ROGUELIKE,
  HACK,
  INDIE,
  ACTION,
  DIFFICULT,
  ATMOSPHERIC,
]);
const hollow = seed("Hollow Knight", 50, [
  METROIDVANIA,
  PLATFORMER,
  INDIE,
  ACTION,
  DIFFICULT,
  ATMOSPHERIC,
  PIXEL,
]);
const celeste = seed("Celeste", 30, [
  PLATFORMER,
  INDIE,
  DIFFICULT,
  PIXEL,
  ATMOSPHERIC,
]);

const library = [clicker, hades, hollow, celeste];

describe("buildTasteProfile", () => {
  it("leaves idle games out by default, since idle tags start in the avoid list", () => {
    const { profile, seeds } = buildTasteProfile(library, DEFAULT_TUNE_OPTIONS);

    assert.ok(
      !seeds.some(
        (entry: { title: string }) => entry.title === "Clicker Heroes"
      )
    );
    assert.ok(!IDLE_TAG_IDS.includes(profile.tags[0].tagId));
    assert.ok(
      !profile.tags.some((tag: { tagId: number }) => tag.tagId === CASUAL)
    );
    assert.equal(profile.dominantFamily, null);
  });

  it("lets the idle game lead when the avoid list is emptied, and names the family", () => {
    const { profile } = buildTasteProfile([clicker, celeste], {
      ...DEFAULT_TUNE_OPTIONS,
      avoidTags: [],
    });

    assert.equal(profile.seeds[0].title, "Clicker Heroes");
    assert.ok(profile.dominantFamily);
    assert.equal(profile.dominantFamily.seedTitle, "Clicker Heroes");
    assert.equal(profile.dominantFamily.seedHours, 3000);
  });

  it("leaves out games with an avoided tag in their first five, and the tags with them", () => {
    const { profile, seeds } = buildTasteProfile(library, {
      ...DEFAULT_TUNE_OPTIONS,
      avoidTags: [IDLER],
      avoidRelated: false,
    });

    assert.ok(
      !seeds.some(
        (entry: { title: string }) => entry.title === "Clicker Heroes"
      )
    );
    assert.ok(
      !profile.tags.some((tag: { tagId: number }) => tag.tagId === CASUAL)
    );
  });

  it("pulls the taste away from a dropped game", () => {
    const dropped = seed("Dropped", 10, [ACTION_ROGUELIKE, 4231], {
      status: "dropped",
    });
    const { vector, seeds } = buildTasteProfile(
      [dropped, hollow, celeste],
      DEFAULT_TUNE_OPTIONS
    );

    assert.ok(
      seeds.find((entry: { title: string }) => entry.title === "Dropped")!
        .weight < 0
    );
    assert.ok((vector.get(4231) ?? 0) < 0);
    assert.ok((vector.get(PLATFORMER) ?? 0) > 0);
  });

  it("lets no game supply more than a fifth of the weight", () => {
    const many = [
      seed("Huge", 5000, [ACTION, INDIE]),
      ...Array.from({ length: 9 }, (_, index) =>
        seed(`Small ${index}`, 20, [PLATFORMER, INDIE])
      ),
    ];
    const { seeds } = buildTasteProfile(many, DEFAULT_TUNE_OPTIONS);

    const huge = seeds.find(
      (entry: { title: string }) => entry.title === "Huge"
    );
    assert.ok(huge!.share <= 0.2 + 1e-6, `share was ${huge!.share}`);
    assert.ok(huge!.notes.includes("capped"));
  });

  it("ignores middling ratings, counts high ones up and low ones against", () => {
    const rated = (rating: number) =>
      buildTasteProfile(
        [seed("Rated", 20, [ACTION, INDIE], { rating })],
        DEFAULT_TUNE_OPTIONS
      ).seeds[0];

    assert.equal(rated(4), undefined);
    assert.ok(rated(10)!.weight > rated(6)!.weight);
    assert.ok(rated(1)!.weight < 0);
  });

  it("counts a finished game for at least ten hours and a wishlisted one as intent", () => {
    const { seeds } = buildTasteProfile(
      [
        seed("Finished", 1, [ACTION, INDIE], { status: "finished" }),
        seed("Wished", 0, [PLATFORMER, INDIE], { wishlisted: true }),
      ],
      DEFAULT_TUNE_OPTIONS
    );

    const finished = seeds.find(
      (entry: { title: string }) => entry.title === "Finished"
    );
    const wished = seeds.find(
      (entry: { title: string }) => entry.title === "Wished"
    );
    assert.ok(finished!.weight >= Math.log2(11));
    assert.ok(wished!.notes.includes("intent"));
    assert.ok(wished!.weight < 1);
  });

  it("uses only recent play in Recent mode and only the chosen games in Games", () => {
    const recent = buildTasteProfile(
      [
        seed("Old", 500, [ACTION, INDIE]),
        seed("New", 50, [PLATFORMER, INDIE], { recentHours: 40 }),
      ],
      { ...DEFAULT_TUNE_OPTIONS, basedOn: "recent" }
    );
    assert.deepEqual(
      recent.seeds.map((entry: { title: string }) => entry.title),
      ["New"]
    );

    const picked = buildTasteProfile(library, {
      ...DEFAULT_TUNE_OPTIONS,
      basedOn: "games",
      pickedGames: ["steam:Celeste"],
    });
    assert.deepEqual(
      picked.seeds.map((entry: { title: string }) => entry.title),
      ["Celeste"]
    );
  });

  it("doubles the tags the person leans toward, even when the library has none", () => {
    const base = buildTasteProfile(library, DEFAULT_TUNE_OPTIONS);
    const leaning = buildTasteProfile(library, {
      ...DEFAULT_TUNE_OPTIONS,
      leanTags: [ROGUELIKE, 9999],
    });

    assert.equal(
      leaning.vector.get(ROGUELIKE),
      (base.vector.get(ROGUELIKE) ?? 0) * 2
    );
    assert.ok((leaning.vector.get(9999) ?? 0) > 0);
  });
});

// @ts-ignore The Node ESM test runner requires the source extension.
import * as settingsModule from "./settings.ts";

describe("migrateTuneSettings", () => {
  const { migrateTuneSettings } = settingsModule;

  it("adds the idle tags once for settings saved with the idle rule on", () => {
    const migrated = migrateTuneSettings({
      options: {
        basedOn: "all-time",
        idleDiscount: true,
        avoidTags: [ROGUELIKE],
      },
      presets: [],
    });
    assert.equal(migrated.version, 2);
    assert.equal(migrated.options.basedOn, "groups");
    assert.ok(
      IDLE_TAG_IDS.every((id: number) =>
        migrated.options.avoidTags.includes(id)
      )
    );
    assert.ok(migrated.options.avoidTags.includes(ROGUELIKE));
    assert.equal("idleDiscount" in migrated.options, false);

    // Removed later, they stay removed.
    const again = migrateTuneSettings({
      ...migrated,
      options: { ...migrated.options, avoidTags: [ROGUELIKE] },
    });
    assert.deepEqual(again.options.avoidTags, [ROGUELIKE]);
  });

  it("leaves the avoid list alone when the idle rule was off", () => {
    const migrated = migrateTuneSettings({
      options: { basedOn: "picked", idleDiscount: false, avoidTags: [] },
      presets: [],
    });
    assert.deepEqual(migrated.options.avoidTags, []);
    assert.equal(migrated.options.basedOn, "games");
  });
});
