import {
  getLibraryGameSource,
  isClassicsGame,
  type LibraryCategoryGame,
  type LibrarySource,
} from "./library-category.js";

export type LibraryTab = "all" | "local" | "steam" | "epic" | "classics";

export const LIBRARY_TABS: readonly LibraryTab[] = [
  "all",
  "local",
  "steam",
  "epic",
  "classics",
];

export const LIBRARY_TAB_STORAGE_KEY = "library-tab";
export const LIBRARY_FILTERS_STORAGE_KEY = "library-filters";

type PlayStatus = "playing" | "finished" | "dropped" | "backlog";

interface FilterableMetadata {
  genres: string[];
  criticScore: number | null;
  protonDbTier: string | null;
  howLongToBeat: { mainStory: number | null } | null;
}

export interface LibraryFilterableGame extends LibraryCategoryGame {
  title?: string | null;
  objectId?: string;
  playStatus?: PlayStatus | null;
  customGenres?: string[] | null;
  metadata?: FilterableMetadata | null;
  installedSizeInBytes?: number | null;
  playTimeInMilliseconds?: number;
  steamPlayTimeInMilliseconds?: number;
  epicPlayTimeInMilliseconds?: number;
  lastTimePlayed?: Date | string | null;
  members?: LibraryFilterableGame[];
}

export interface Range {
  id: string;
  min: number | null;
  max: number | null;
}

const GB = 1024 ** 3;

export const SIZE_RANGES: readonly Range[] = [
  { id: "under_10gb", min: null, max: 10 * GB },
  { id: "10_50gb", min: 10 * GB, max: 50 * GB },
  { id: "50_100gb", min: 50 * GB, max: 100 * GB },
  { id: "over_100gb", min: 100 * GB, max: null },
];

/** Main story length in hours. */
export const HOW_LONG_TO_BEAT_RANGES: readonly Range[] = [
  { id: "under_2h", min: null, max: 2 },
  { id: "2_6h", min: 2, max: 6 },
  { id: "6_15h", min: 6, max: 15 },
  { id: "15_30h", min: 15, max: 30 },
  { id: "30_60h", min: 30, max: 60 },
  { id: "over_60h", min: 60, max: null },
];

export const CRITIC_SCORE_RANGES: readonly Range[] = [
  { id: "90_plus", min: 90, max: null },
  { id: "80_89", min: 80, max: 90 },
  { id: "70_79", min: 70, max: 80 },
  { id: "under_70", min: null, max: 70 },
];

export const PROTONDB_TIERS = [
  "platinum",
  "gold",
  "silver",
  "bronze",
  "borked",
] as const;

/** "none" matches games without a play status. */
export type PlayStatusFilter = PlayStatus | "none";

export interface LibraryFilters {
  playStatuses: PlayStatusFilter[];
  genres: string[];
  protonDbTiers: string[];
  sizes: string[];
  howLongToBeat: string[];
  criticScores: string[];
  neverPlayed: boolean;
  hideDuplicates: boolean;
}

export const EMPTY_LIBRARY_FILTERS: LibraryFilters = {
  playStatuses: [],
  genres: [],
  protonDbTiers: [],
  sizes: [],
  howLongToBeat: [],
  criticScores: [],
  neverPlayed: false,
  hideDuplicates: false,
};

export const isLibraryTab = (value: unknown): value is LibraryTab =>
  LIBRARY_TABS.includes(value as LibraryTab);

/**
 * The tab from storage. Before the tabs, the library had All / PC / Classics
 * plus a source dropdown; a single selected source becomes its tab.
 */
export const readStoredLibraryTab = (
  storage: Pick<Storage, "getItem">,
  legacyCategoryKey: string,
  legacySourcesKey: string
): LibraryTab => {
  const stored = storage.getItem(LIBRARY_TAB_STORAGE_KEY);
  if (isLibraryTab(stored)) return stored;

  const legacyCategory = storage.getItem(legacyCategoryKey);
  if (legacyCategory === "classics") return "classics";
  if (legacyCategory === "steam_library") return "steam";

  try {
    const sources: unknown = JSON.parse(
      storage.getItem(legacySourcesKey) ?? "[]"
    );
    if (Array.isArray(sources) && sources.length === 1) {
      const [source] = sources;
      if (source === "hydra") return "local";
      if (source === "steam" || source === "epic") return source;
    }
  } catch {
    // Unreadable legacy value; fall through to All.
  }

  return "all";
};

const toStringList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

export const parseStoredLibraryFilters = (
  value: string | null
): LibraryFilters => {
  if (!value) return EMPTY_LIBRARY_FILTERS;

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return {
      playStatuses: toStringList(parsed.playStatuses) as PlayStatusFilter[],
      genres: toStringList(parsed.genres),
      protonDbTiers: toStringList(parsed.protonDbTiers),
      sizes: toStringList(parsed.sizes),
      howLongToBeat: toStringList(parsed.howLongToBeat),
      criticScores: toStringList(parsed.criticScores),
      neverPlayed: parsed.neverPlayed === true,
      hideDuplicates: parsed.hideDuplicates === true,
    };
  } catch {
    return EMPTY_LIBRARY_FILTERS;
  }
};

/** Filters that narrow the list; hiding duplicates doesn't count. */
export const countActiveLibraryFilters = (filters: LibraryFilters) =>
  filters.playStatuses.length +
  filters.genres.length +
  filters.protonDbTiers.length +
  filters.sizes.length +
  filters.howLongToBeat.length +
  filters.criticScores.length +
  (filters.neverPlayed ? 1 : 0);

const membersOf = <T extends LibraryFilterableGame>(game: T) =>
  (game.members as T[] | undefined) ?? [game];

const hasSource = (game: LibraryFilterableGame, source: LibrarySource) =>
  membersOf(game).some((member) => getLibraryGameSource(member) === source);

export const libraryTabIncludes = (
  game: LibraryFilterableGame,
  tab: LibraryTab
) => {
  switch (tab) {
    case "classics":
      return isClassicsGame(game);
    case "local":
      return !isClassicsGame(game) && hasSource(game, "hydra");
    case "steam":
      return hasSource(game, "steam");
    case "epic":
      return hasSource(game, "epic");
    case "all":
    default:
      return true;
  }
};

export const filterLibraryGamesByTab = <T extends LibraryFilterableGame>(
  games: T[],
  tab: LibraryTab
): T[] =>
  tab === "all" ? games : games.filter((game) => libraryTabIncludes(game, tab));

/** Steam and Epic tabs are shown only when the library has such games. */
export const getAvailableLibraryTabs = (
  games: LibraryFilterableGame[]
): LibraryTab[] =>
  LIBRARY_TABS.filter(
    (tab) =>
      (tab !== "steam" && tab !== "epic") ||
      games.some((game) => libraryTabIncludes(game, tab))
  );

export const getGameGenres = (game: LibraryFilterableGame): string[] =>
  game.customGenres && game.customGenres.length > 0
    ? game.customGenres
    : (game.metadata?.genres ?? []);

export const getLibraryGenres = (games: LibraryFilterableGame[]): string[] =>
  Array.from(new Set(games.flatMap(getGameGenres))).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );

const getTotalPlayTime = (game: LibraryFilterableGame) =>
  (game.playTimeInMilliseconds ?? 0) +
  (game.steamPlayTimeInMilliseconds ?? 0) +
  (game.epicPlayTimeInMilliseconds ?? 0);

const inAnyRange = (
  value: number | null | undefined,
  rangeIds: string[],
  ranges: readonly Range[]
) => {
  if (rangeIds.length === 0) return true;
  if (value == null || value <= 0) return false;

  return ranges.some(
    (range) =>
      rangeIds.includes(range.id) &&
      (range.min === null || value >= range.min) &&
      (range.max === null || value < range.max)
  );
};

export const matchesLibraryFilters = (
  game: LibraryFilterableGame,
  filters: LibraryFilters
) => {
  if (
    filters.playStatuses.length > 0 &&
    !filters.playStatuses.includes(game.playStatus ?? "none")
  ) {
    return false;
  }

  if (filters.genres.length > 0) {
    const genres = getGameGenres(game);
    if (!filters.genres.some((genre) => genres.includes(genre))) return false;
  }

  if (
    filters.protonDbTiers.length > 0 &&
    !filters.protonDbTiers.includes(game.metadata?.protonDbTier ?? "")
  ) {
    return false;
  }

  if (filters.neverPlayed && getTotalPlayTime(game) > 0) return false;

  return (
    inAnyRange(game.installedSizeInBytes, filters.sizes, SIZE_RANGES) &&
    inAnyRange(
      game.metadata?.howLongToBeat?.mainStory,
      filters.howLongToBeat,
      HOW_LONG_TO_BEAT_RANGES
    ) &&
    inAnyRange(
      game.metadata?.criticScore,
      filters.criticScores,
      CRITIC_SCORE_RANGES
    )
  );
};

const normalizeTitle = (title: string | null | undefined) =>
  (title ?? "")
    .replace(/[™®©]/g, "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const isSteamCopy = (game: LibraryFilterableGame) =>
  membersOf(game).some(
    (member) => member.shop === "steam" || member.hasActiveSteamImport === true
  );

/**
 * One entry per title: the Steam copy wins, then the one with more playtime.
 * The list order is kept.
 */
export const hideDuplicateLibraryGames = <T extends LibraryFilterableGame>(
  games: T[]
): T[] => {
  const kept = new Map<string, T>();

  for (const game of games) {
    const title = normalizeTitle(game.title);
    if (!title) continue;

    const current = kept.get(title);
    if (
      !current ||
      (isSteamCopy(game) && !isSteamCopy(current)) ||
      (isSteamCopy(game) === isSteamCopy(current) &&
        getTotalPlayTime(game) > getTotalPlayTime(current))
    ) {
      kept.set(title, game);
    }
  }

  const keep = new Set(kept.values());
  return games.filter((game) => !normalizeTitle(game.title) || keep.has(game));
};

export const applyLibraryFilters = <T extends LibraryFilterableGame>(
  games: T[],
  filters: LibraryFilters
): T[] => {
  const filtered = games.filter((game) => matchesLibraryFilters(game, filters));
  return filters.hideDuplicates
    ? hideDuplicateLibraryGames(filtered)
    : filtered;
};
