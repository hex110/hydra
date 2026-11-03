import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-ignore The Node ESM test runner requires the source extension.
import * as charts from "./catalogue-charts.ts";

const { filterChartRows, DEFAULT_CHART_FILTERS } = charts;

const row = (appId: string, over: Record<string, unknown> = {}) => ({
  rank: 1,
  appId,
  title: appId,
  headerImageUrl: null,
  tagIds: [4182, 122],
  reviewPercent: 90,
  reviewCount: 5000,
  criticScore: null,
  releaseYear: 2020,
  isSingleplayer: true,
  isEarlyAccess: false,
  isFree: false,
  players: null,
  peak: null,
  places: null,
  isNew: false,
  days: null,
  hours: null,
  ...over,
});

const apply = (
  rows: ReturnType<typeof row>[],
  filters: Record<string, unknown>,
  context = {}
) =>
  filterChartRows(rows, { ...DEFAULT_CHART_FILTERS, ...filters }, context).map(
    (entry: { appId: string }) => entry.appId
  );

describe("filterChartRows", () => {
  const rows = [
    row("hades"),
    row("clicker", { tagIds: [379975, 597, 3871], isSingleplayer: true }),
    row("shooter", {
      tagIds: [1774, 3859],
      isSingleplayer: false,
      isFree: true,
    }),
    row("early", { isEarlyAccess: true, reviewCount: 40 }),
  ];

  it("keeps everything by default", () => {
    assert.equal(apply(rows, {}).length, 4);
  });

  it("avoids a tag and, with related tags on, its family", () => {
    assert.deepEqual(apply(rows, { avoidTags: [615955] }), [
      "hades",
      "shooter",
      "early",
    ]);
    assert.equal(
      apply(rows, { avoidTags: [615955], avoidRelated: false }).length,
      4
    );
  });

  it("only avoids a tag among the first tags", () => {
    const lowTag = [row("late", { tagIds: [1, 2, 3, 4, 5, 379975] })];
    assert.equal(apply(lowTag, { avoidTags: [379975] }).length, 1);
    assert.equal(
      apply(lowTag, { avoidTags: [379975], avoidDepth: 10 }).length,
      0
    );
  });

  it("requires every included tag", () => {
    assert.deepEqual(apply(rows, { includeTags: [4182, 122] }), [
      "hades",
      "early",
    ]);
  });

  it("filters singleplayer, Early Access, free to play and review count", () => {
    assert.ok(!apply(rows, { singleplayerOnly: true }).includes("shooter"));
    assert.ok(!apply(rows, { hideEarlyAccess: true }).includes("early"));
    assert.deepEqual(apply(rows, { freeToPlay: "only" }), ["shooter"]);
    assert.ok(!apply(rows, { freeToPlay: "hide" }).includes("shooter"));
    assert.ok(!apply(rows, { minReviews: 1000 }).includes("early"));
  });

  it("filters by ProtonDB tier, leaving out games with no known tier", () => {
    const tiers = { hades: "platinum", clicker: "silver", shooter: null };
    assert.deepEqual(apply(rows, { protondb: "gold" }, { tiers }), ["hades"]);
    assert.deepEqual(apply(rows, { protondb: "silver" }, { tiers }), [
      "hades",
      "clicker",
    ]);
  });

  it("leaves out hidden games", () => {
    assert.ok(
      !apply(rows, {}, { hidden: new Set(["hades"]) }).includes("hades")
    );
  });
});
