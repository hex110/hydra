import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-ignore The Node ESM test runner requires the source extension.
import * as libraryFilters from "./library-filters.ts";
// @ts-ignore The Node ESM test runner requires the source extension.
import type { LibraryFilterableGame } from "./library-filters.ts";

type TestGame = LibraryFilterableGame & { id: string; platform?: string };

const {
  applyLibraryFilters,
  countActiveLibraryFilters,
  EMPTY_LIBRARY_FILTERS,
  filterLibraryGamesByTab,
  getAvailableLibraryTabs,
  getLibraryGenres,
  hideDuplicateLibraryGames,
  parseStoredLibraryFilters,
  readStoredLibraryTab,
} = libraryFilters;

const GB = 1024 ** 3;

const metadata = (
  overrides: Partial<NonNullable<LibraryFilterableGame["metadata"]>> = {}
): NonNullable<LibraryFilterableGame["metadata"]> => ({
  genres: [],
  criticScore: null,
  protonDbTier: null,
  howLongToBeat: null,
  ...overrides,
});

const games: TestGame[] = [
  {
    id: "repack",
    shop: "steam",
    title: "Cyberpunk 2077",
    playStatus: "playing",
    installedSizeInBytes: 70 * GB,
    playTimeInMilliseconds: 3_600_000,
    metadata: metadata({
      genres: ["RPG"],
      criticScore: 86,
      protonDbTier: "gold",
      howLongToBeat: { mainStory: 26 },
    }),
  },
  {
    id: "steam-import",
    shop: "steam",
    title: "Hades",
    hasActiveSteamImport: true,
    playStatus: "finished",
    installedSizeInBytes: 15 * GB,
    metadata: metadata({
      genres: ["Action", "Indie"],
      criticScore: 93,
      protonDbTier: "platinum",
      howLongToBeat: { mainStory: 22 },
    }),
  },
  {
    id: "epic-import",
    shop: "epic",
    title: "Alan Wake 2",
    hasActiveEpicImport: true,
    metadata: metadata({ genres: ["Action"], criticScore: 89 }),
  },
  { id: "custom", shop: "custom", title: "Homebrew", customGenres: ["Puzzle"] },
  { id: "snes", shop: "launchbox", title: "Chrono Trigger", platform: "SNES" },
];

const ids = (list: LibraryFilterableGame[]) =>
  list.map((game) => (game as TestGame).id);

const storage = (values: Record<string, string>) => ({
  getItem: (key: string) => values[key] ?? null,
});

describe("library tabs", () => {
  it("splits local, Steam, Epic and classics games", () => {
    assert.deepEqual(ids(filterLibraryGamesByTab(games, "all")), ids(games));
    assert.deepEqual(ids(filterLibraryGamesByTab(games, "local")), [
      "repack",
      "custom",
    ]);
    assert.deepEqual(ids(filterLibraryGamesByTab(games, "steam")), [
      "steam-import",
    ]);
    assert.deepEqual(ids(filterLibraryGamesByTab(games, "epic")), [
      "epic-import",
    ]);
    assert.deepEqual(ids(filterLibraryGamesByTab(games, "classics")), ["snes"]);
  });

  it("puts a grouped game in the tab of every copy", () => {
    const grouped: TestGame = {
      id: "group",
      shop: "steam",
      members: [
        { shop: "steam", hasActiveSteamImport: true },
        { shop: "steam", hasActiveSteamImport: false },
      ],
    };
    assert.deepEqual(ids(filterLibraryGamesByTab([grouped], "steam")), [
      "group",
    ]);
    assert.deepEqual(ids(filterLibraryGamesByTab([grouped], "local")), [
      "group",
    ]);
  });

  it("only offers Steam and Epic tabs when there are such games", () => {
    assert.deepEqual(getAvailableLibraryTabs(games), [
      "all",
      "local",
      "steam",
      "epic",
      "classics",
    ]);
    assert.deepEqual(getAvailableLibraryTabs([games[0]]), [
      "all",
      "local",
      "classics",
    ]);
  });

  it("migrates the old category and source filter", () => {
    const keys = ["library-category", "library-sources"] as const;
    assert.equal(readStoredLibraryTab(storage({}), ...keys), "all");
    assert.equal(
      readStoredLibraryTab(storage({ "library-tab": "epic" }), ...keys),
      "epic"
    );
    assert.equal(
      readStoredLibraryTab(
        storage({ "library-category": "classics" }),
        ...keys
      ),
      "classics"
    );
    assert.equal(
      readStoredLibraryTab(
        storage({ "library-category": "steam_library" }),
        ...keys
      ),
      "steam"
    );
    assert.equal(
      readStoredLibraryTab(
        storage({ "library-category": "pc", "library-sources": '["hydra"]' }),
        ...keys
      ),
      "local"
    );
    assert.equal(
      readStoredLibraryTab(
        storage({ "library-sources": '["steam","epic"]' }),
        ...keys
      ),
      "all"
    );
    assert.equal(
      readStoredLibraryTab(storage({ "library-sources": "{" }), ...keys),
      "all"
    );
  });
});

describe("library filters", () => {
  const filter = (overrides: Partial<typeof EMPTY_LIBRARY_FILTERS>) =>
    ids(applyLibraryFilters(games, { ...EMPTY_LIBRARY_FILTERS, ...overrides }));

  it("keeps everything without filters", () => {
    assert.deepEqual(filter({}), ids(games));
  });

  it("filters by play status, with none for games without one", () => {
    assert.deepEqual(filter({ playStatuses: ["playing", "finished"] }), [
      "repack",
      "steam-import",
    ]);
    assert.deepEqual(filter({ playStatuses: ["none"] }), [
      "epic-import",
      "custom",
      "snes",
    ]);
  });

  it("filters by genre, preferring the user's genres", () => {
    assert.deepEqual(filter({ genres: ["Action"] }), [
      "steam-import",
      "epic-import",
    ]);
    assert.deepEqual(filter({ genres: ["Puzzle", "RPG"] }), [
      "repack",
      "custom",
    ]);
  });

  it("filters by ProtonDB tier", () => {
    assert.deepEqual(filter({ protonDbTiers: ["platinum"] }), ["steam-import"]);
  });

  it("filters by ranges and leaves out games without the value", () => {
    assert.deepEqual(filter({ sizes: ["10_50gb"] }), ["steam-import"]);
    assert.deepEqual(filter({ sizes: ["10_50gb", "50_100gb"] }), [
      "repack",
      "steam-import",
    ]);
    assert.deepEqual(filter({ howLongToBeat: ["15_30h"] }), [
      "repack",
      "steam-import",
    ]);
    assert.deepEqual(filter({ criticScores: ["80_89"] }), [
      "repack",
      "epic-import",
    ]);
    assert.deepEqual(filter({ criticScores: ["90_plus"] }), ["steam-import"]);
  });

  it("filters games never played", () => {
    assert.deepEqual(filter({ neverPlayed: true }), [
      "steam-import",
      "epic-import",
      "custom",
      "snes",
    ]);
  });

  it("counts active filters without the duplicate toggle", () => {
    assert.equal(
      countActiveLibraryFilters({
        ...EMPTY_LIBRARY_FILTERS,
        genres: ["RPG", "Action"],
        neverPlayed: true,
        hideDuplicates: true,
      }),
      3
    );
  });

  it("lists the genres in the library, sorted", () => {
    assert.deepEqual(getLibraryGenres(games), [
      "Action",
      "Indie",
      "Puzzle",
      "RPG",
    ]);
  });

  it("reads stored filters defensively", () => {
    assert.deepEqual(parseStoredLibraryFilters(null), EMPTY_LIBRARY_FILTERS);
    assert.deepEqual(parseStoredLibraryFilters("nope"), EMPTY_LIBRARY_FILTERS);
    assert.deepEqual(
      parseStoredLibraryFilters('{"genres":["RPG",3],"neverPlayed":true}'),
      { ...EMPTY_LIBRARY_FILTERS, genres: ["RPG"], neverPlayed: true }
    );
  });
});

describe("hideDuplicateLibraryGames", () => {
  it("keeps the Steam copy, then the one with more playtime, in list order", () => {
    const list: TestGame[] = [
      {
        id: "a",
        shop: "custom",
        title: "Hollow Knight",
        playTimeInMilliseconds: 9,
      },
      { id: "b", shop: "steam", title: "Hollow Knight™" },
      { id: "c", shop: "custom", title: "Celeste", playTimeInMilliseconds: 1 },
      { id: "d", shop: "custom", title: "celeste", playTimeInMilliseconds: 5 },
      { id: "e", shop: "custom", title: "Unique" },
    ];
    assert.deepEqual(ids(hideDuplicateLibraryGames(list)), ["b", "d", "e"]);
  });
});
