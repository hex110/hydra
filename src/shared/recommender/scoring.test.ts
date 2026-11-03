import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-ignore The Node ESM test runner requires the source extension.
import * as profileModule from "./profile.ts";
// @ts-ignore The Node ESM test runner requires the source extension.
import * as scoringModule from "./scoring.ts";
// @ts-ignore The Node ESM test runner requires the source extension.
import * as typesModule from "./types.ts";
// @ts-ignore The Node ESM test runner requires the source extension.
import * as groupsModule from "./groups.ts";

const { buildTasteProfile } = profileModule;
const {
  rankCandidates,
  diversify,
  passesFilters,
  interleaveGroups,
  seenFactor,
  isoWeek,
} = scoringModule;
const { DEFAULT_TUNE_OPTIONS } = typesModule;
const { groupSeeds } = groupsModule;

const IDLER = 615955;
const INDIE = 492;
const ACTION = 19;
const ROGUELIKE = 1716;
const ROGUELITE = 3959;
const PLATFORMER = 1625;
const DIFFICULT = 4026;
const CO_OP = 1685;

const tags = (...ids: number[]) =>
  ids.map((tagid, index) => ({ tagid, weight: 1000 - index * 40 }));

const seed = (title: string, tagIds: number[], hours = 40) => ({
  key: `steam:${title}`,
  appId: title,
  title,
  hours,
  recentHours: 0,
  rating: null,
  status: null,
  wishlisted: false,
  tags: tags(...tagIds),
});

const candidate = (appId: string, tagIds: number[], over = {}) => ({
  appId,
  title: appId,
  tags: tags(...tagIds),
  reviewCount: 5000,
  reviewPercent: 92,
  reviewLabel: "Very Positive",
  releaseDate: Date.UTC(2020, 5, 1),
  isEarlyAccess: false,
  type: 0,
  playerCategories: [2],
  developers: [`Dev ${appId}`],
  publishers: [],
  headerImageUrl: null,
  behaviour: [],
  ...over,
});

const options = DEFAULT_TUNE_OPTIONS;

/** The whole library as one group without anchors, to test scoring alone. */
const wholeGroup = (built: {
  vector: Map<number, number>;
  seeds: ReturnType<typeof buildTasteProfile>["seeds"];
}) => ({
  id: "all",
  anchors: [],
  seeds: built.seeds,
  vector: built.vector,
  hours: 0,
  weight: 1,
  share: 1,
  rarestAnchorOnly: false,
});

describe("passesFilters", () => {
  it("drops an avoided tag within the strictness depth and not below it", () => {
    const avoid = { ...options, avoidTags: [IDLER] };
    assert.equal(
      passesFilters(candidate("a", [ACTION, IDLER, INDIE]), avoid),
      false
    );
    const deep = candidate("b", [
      ACTION,
      INDIE,
      ROGUELIKE,
      DIFFICULT,
      PLATFORMER,
      IDLER,
    ]);
    assert.equal(passesFilters(deep, avoid), true);
    assert.equal(passesFilters(deep, { ...avoid, avoidStrictness: 10 }), false);
  });

  it("leaves idle games out with the default avoid list, and lets them in once it is emptied", () => {
    const idle = candidate("idle", [ACTION, 560542, INDIE]);
    assert.equal(passesFilters(idle, options), false);
    assert.equal(passesFilters(idle, { ...options, avoidTags: [] }), true);
  });

  it("takes the related tags with an avoided one unless told not to", () => {
    const related = candidate("a", [560542, ACTION]);
    assert.equal(
      passesFilters(related, {
        ...options,
        avoidTags: [IDLER],
      }),
      false
    );
    assert.equal(
      passesFilters(related, {
        ...options,
        avoidTags: [IDLER],
        avoidRelated: false,
      }),
      true
    );
  });

  it("wants a leaned-toward tag, or one of its family, within the depth", () => {
    const lean = { ...options, leanTags: [ROGUELIKE], leanDepth: 3 as const };
    const sixth = candidate("sixth", [
      ACTION,
      INDIE,
      DIFFICULT,
      PLATFORMER,
      CO_OP,
      ROGUELIKE,
    ]);
    assert.equal(passesFilters(sixth, lean), false);
    assert.equal(passesFilters(sixth, { ...lean, leanDepth: 10 }), true);
    assert.equal(
      passesFilters(candidate("family", [ACTION, ROGUELITE]), lean),
      true
    );
  });

  it("applies the review filters, and the percentage only from 50 reviews", () => {
    assert.equal(
      passesFilters(candidate("a", [ACTION], { reviewPercent: 60 }), options),
      false
    );
    assert.equal(
      passesFilters(
        candidate("b", [ACTION], { reviewCount: 30, reviewPercent: 40 }),
        {
          ...options,
          minReviews: 10,
        }
      ),
      true
    );
    assert.equal(
      passesFilters(candidate("c", [ACTION], { reviewCount: 10 }), options),
      false
    );
    assert.equal(
      passesFilters(candidate("d", [ACTION], { reviewCount: 9000 }), {
        ...options,
        maxReviews: 5000,
      }),
      false
    );
  });

  it("drops non-games, demos, years outside the range, Early Access and multiplayer when asked", () => {
    assert.equal(
      passesFilters(candidate("a", [ACTION], { type: 4 }), options),
      false
    );
    assert.equal(
      passesFilters(candidate("Game Demo", [ACTION]), options),
      false
    );
    assert.equal(
      passesFilters(candidate("b", [ACTION]), {
        ...options,
        years: { gte: 2021 },
      }),
      false
    );
    assert.equal(
      passesFilters(candidate("c", [ACTION], { isEarlyAccess: true }), {
        ...options,
        hideEarlyAccess: true,
      }),
      false
    );
    assert.equal(
      passesFilters(candidate("d", [ACTION], { playerCategories: [1] }), {
        ...options,
        singleplayerOnly: true,
      }),
      false
    );
  });
});

describe("rankCandidates", () => {
  const library = [
    seed("Hades", [ROGUELIKE, ACTION, INDIE, DIFFICULT]),
    seed("Celeste", [PLATFORMER, INDIE, DIFFICULT]),
  ];
  const group = wholeGroup(buildTasteProfile(library, options));

  it("ranks games that share the taste above games that do not", () => {
    const ranked = rankCandidates(
      [
        candidate("match", [ROGUELIKE, ACTION, INDIE]),
        candidate("other", [CO_OP, 1667, 1742]),
      ],
      group,
      options
    );

    assert.equal(ranked[0].candidate.appId, "match");
    assert.ok(ranked[0].matchTagIds.length > 0);
  });

  it("uses Steam's list for the reason", () => {
    const ranked = rankCandidates(
      [
        candidate("match", [ROGUELIKE, ACTION], {
          behaviour: [{ seedKey: "steam:Hades", place: 1 }],
        }),
      ],
      group,
      options
    );

    assert.equal(ranked[0].becauseOf?.title, "Hades");
  });

  it("moves niche games up with the slider without changing which games qualify", () => {
    const pool = [
      candidate("big", [ROGUELIKE, ACTION, INDIE], { reviewCount: 200000 }),
      candidate("small", [ROGUELIKE, ACTION, INDIE], { reviewCount: 120 }),
    ];
    const names = (items: { candidate: { appId: string } }[]) =>
      items.map((item) => item.candidate.appId);

    const popular = rankCandidates(pool, group, {
      ...options,
      popularity: 1,
    });
    const niche = rankCandidates(pool, group, {
      ...options,
      popularity: -1,
    });

    assert.equal(popular[0].candidate.appId, "big");
    assert.equal(niche[0].candidate.appId, "small");
    assert.deepEqual([...names(popular)].sort(), [...names(niche)].sort());
  });

  it("moves newer games up with the slider", () => {
    const pool = [
      candidate("old", [ROGUELIKE, ACTION], {
        releaseDate: Date.UTC(2008, 1, 1),
      }),
      candidate("new", [ROGUELIKE, ACTION], {
        releaseDate: Date.UTC(2025, 1, 1),
      }),
    ];
    assert.equal(
      rankCandidates(pool, group, { ...options, recency: 1 })[0].candidate
        .appId,
      "new"
    );
    assert.equal(
      rankCandidates(pool, group, { ...options, recency: -1 })[0].candidate
        .appId,
      "old"
    );
  });

  it("has no idle game in the results when Idler is avoided", () => {
    const avoid = { ...options, avoidTags: [IDLER] };
    const ranked = rankCandidates(
      [
        candidate("idle", [IDLER, ACTION, INDIE]),
        candidate("fine", [ROGUELIKE, ACTION]),
      ],
      group,
      avoid
    );

    assert.deepEqual(
      ranked.map(
        (item: { candidate: { appId: string } }) => item.candidate.appId
      ),
      ["fine"]
    );
  });
});

describe("diversify", () => {
  const scored = (
    appId: string,
    score: number,
    seedTitle: string,
    developer: string
  ) => ({
    candidate: candidate(appId, [ACTION], { developers: [developer] }),
    groupId: "all",
    score,
    similarity: score,
    vector: new Map([[ACTION, 1]]),
    becauseOf: {
      key: `steam:${seedTitle}`,
      appId: seedTitle,
      title: seedTitle,
    },
    matchTagIds: [],
  });

  it("keeps at most three games per played game in the first dozen", () => {
    const seedsNames = ["A", "B", "C", "D"];
    const ranked = Array.from({ length: 40 }, (_, index) =>
      scored(
        `g${index}`,
        1 - index * 0.01,
        seedsNames[index < 20 ? 0 : index % 4],
        `d${index}`
      )
    );

    const picked = diversify(ranked, 12);
    const counts = new Map<string, number>();
    for (const item of picked) {
      const key = item.becauseOf!.key;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    assert.equal(picked.length, 12);
    assert.ok(
      [...counts.values()].every((count) => count <= 3),
      JSON.stringify([...counts])
    );
  });

  it("keeps at most two games per developer", () => {
    const ranked = Array.from({ length: 10 }, (_, index) =>
      scored(
        `g${index}`,
        1 - index * 0.01,
        `S${index}`,
        index < 6 ? "Same" : `d${index}`
      )
    );

    const picked = diversify(ranked, 6);
    assert.ok(
      picked.filter(
        (item: { candidate: { developers: string[] } }) =>
          item.candidate.developers[0] === "Same"
      ).length <= 2
    );
  });

  it("returns what it has when fewer games than the limit remain", () => {
    const ranked = [scored("a", 1, "A", "x"), scored("b", 0.9, "A", "x")];
    assert.equal(diversify(ranked, 10).length, 2);
  });
});

const FLIGHT = 15045;
const MILITARY = 4168;
const WAR = 1678;
const FPS = 1663;
const SIMULATION = 599;
const MANAGEMENT = 12472;
const BUILDING = 1643;

describe("groups and the anchor rule", () => {
  // Flight is rare in the catalogue; Military, War and Action are common.
  const idf = new Map([
    [FLIGHT, 6],
    [MILITARY, 2],
    [WAR, 2],
    [ACTION, 0.5],
    [FPS, 2.5],
    [INDIE, 0.4],
    [SIMULATION, 1.5],
    [PLATFORMER, 2.2],
    [DIFFICULT, 2],
  ]);

  it("ranks a flight game above a military shooter for a game that leads with Flight", () => {
    const aceCombat = seed("Ace Combat 7", [
      FLIGHT,
      MILITARY,
      WAR,
      ACTION,
      SIMULATION,
    ]);
    const built = buildTasteProfile([aceCombat], {
      ...options,
      basedOn: "games",
      pickedGames: ["steam:Ace Combat 7"],
    });
    const [group] = groupsModule.groupPickedGames(built.seeds, idf);
    assert.deepEqual(group.anchors, [FLIGHT]);

    const ranked = rankCandidates(
      [
        // Shares more tags, but not the one that defines the game.
        candidate("squad", [MILITARY, WAR, FPS, ACTION, SIMULATION]),
        candidate("flight sim", [SIMULATION, FLIGHT, ACTION]),
      ],
      group,
      { ...options, avoidTags: [] },
      { idf }
    );
    assert.deepEqual(
      ranked.map(
        (item: { candidate: { appId: string } }) => item.candidate.appId
      ),
      ["flight sim"]
    );
  });

  it("splits a mixed library into groups named by what sets them apart", () => {
    const shooters = Array.from({ length: 36 }, (_, index) =>
      seed(`shooter ${index}`, [FPS, MILITARY, ACTION, WAR], 60)
    );
    const platformers = Array.from({ length: 36 }, (_, index) =>
      seed(`platformer ${index}`, [PLATFORMER, DIFFICULT, INDIE], 40)
    );
    const builders = Array.from({ length: 36 }, (_, index) =>
      seed(`builder ${index}`, [MANAGEMENT, BUILDING, SIMULATION], 30)
    );
    const built = buildTasteProfile(
      [...shooters, ...platformers, ...builders],
      {
        ...options,
        avoidTags: [],
      }
    );
    const groups = groupSeeds(built.seeds, idf);

    // 108 games make three groups, one per kind of game.
    assert.equal(groups.length, 3);
    const leads = groups.map((group: { anchors: number[] }) => group.anchors);
    assert.ok(leads.some((anchors: number[]) => anchors.includes(FPS)));
    assert.ok(leads.some((anchors: number[]) => anchors.includes(PLATFORMER)));
    assert.ok(leads.some((anchors: number[]) => anchors.includes(MANAGEMENT)));
    // Every game is in exactly one group.
    const count = groups.reduce(
      (sum: number, group: { seeds: unknown[] }) => sum + group.seeds.length,
      0
    );
    assert.equal(count, 108);
  });

  it("always gives the same groups for the same library", () => {
    const library = [
      seed("a", [FPS, MILITARY, ACTION], 90),
      seed("b", [PLATFORMER, DIFFICULT, INDIE], 50),
      seed("c", [FPS, WAR, ACTION], 40),
    ];
    const built = buildTasteProfile(library, options);
    const ids = (list: { id: string }[]) => list.map((group) => group.id);
    assert.deepEqual(
      ids(groupSeeds(built.seeds, idf)),
      ids(groupSeeds(built.seeds, idf))
    );
  });
});

describe("mixing groups", () => {
  const item = (appId: string, groupId: string) => ({
    candidate: candidate(appId, [ACTION]),
    groupId,
    score: 1,
    similarity: 1,
    vector: new Map(),
    becauseOf: null,
    matchTagIds: [],
  });

  it("gives each group results in proportion to its share, without repeats", () => {
    const big = Array.from({ length: 30 }, (_, index) =>
      item(`b${index}`, "big")
    );
    const small = [
      item("s0", "small"),
      item("b0", "small"),
      item("s1", "small"),
    ];
    const mixed = interleaveGroups(
      [
        { share: 0.75, items: big },
        { share: 0.25, items: small },
      ],
      8
    );
    const ids = mixed.map(
      (entry: { candidate: { appId: string } }) => entry.candidate.appId
    );
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(ids.filter((id: string) => id.startsWith("s")).length, 2);
  });
});

describe("freshness", () => {
  it("lets a game sink only after it was shown several times unopened", () => {
    assert.equal(seenFactor(undefined), 1);
    assert.equal(seenFactor(3), 1);
    assert.ok(seenFactor(5) < 1);
    assert.equal(seenFactor(100), 0.7);
  });

  it("keeps one week's order and changes it the next", () => {
    assert.equal(
      isoWeek(Date.UTC(2026, 10, 2)),
      isoWeek(Date.UTC(2026, 10, 8))
    );
    assert.notEqual(
      isoWeek(Date.UTC(2026, 10, 8)),
      isoWeek(Date.UTC(2026, 10, 9))
    );
  });
});
