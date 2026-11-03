import type { CatalogueSearchPayload } from "@types";
import type {
  SteamSearchQuery,
  SteamSearchSort,
} from "./steam-store-search.js";

export type BrowsePlayer = NonNullable<
  CatalogueSearchPayload["players"]
>[number];

/** Steam's player categories for the Players filter. */
export const BROWSE_PLAYER_CATEGORIES: Record<BrowsePlayer, number> = {
  single: 2,
  coop: 9,
  pvp: 36,
  local: 24,
};

/**
 * Which search answers a Browse request. Hydra's search knows download
 * sources, genres, developers, ProtonDB, Steam Deck and release years; Steam's
 * store search can leave tags out, sort by reviews and filter by players.
 * `hydra-filtered` is Hydra's search with what only Steam can do applied to
 * each loaded page, so its count is approximate.
 */
export type BrowseBackend = "hydra" | "steam" | "hydra-filtered";

export const getBrowseExclusions = (
  filters: CatalogueSearchPayload,
  avoidTags: readonly number[]
) => [
  ...new Set([
    ...(filters.excludeTags ?? []),
    ...(filters.useAvoidList ? avoidTags : []),
  ]),
];

const needsSteam = (filters: CatalogueSearchPayload, exclusions: number[]) =>
  exclusions.length > 0 ||
  filters.sortBy === "bestRated" ||
  (filters.players?.length ?? 0) > 0;

const usesHydraOnly = (filters: CatalogueSearchPayload) =>
  filters.downloadSourceFingerprints.length > 0 ||
  filters.genres.length > 0 ||
  filters.developers.length > 0 ||
  filters.publishers.length > 0 ||
  filters.protondbSupportBadges.length > 0 ||
  filters.deckCompatibility.length > 0 ||
  !!filters.releaseYear;

export const chooseBrowseBackend = (
  filters: CatalogueSearchPayload,
  avoidTags: readonly number[]
): BrowseBackend => {
  if (!needsSteam(filters, getBrowseExclusions(filters, avoidTags)))
    return "hydra";
  return usesHydraOnly(filters) ? "hydra-filtered" : "steam";
};

const STEAM_SORTS: Partial<
  Record<
    CatalogueSearchPayload["sortBy"],
    Record<"asc" | "desc", SteamSearchSort>
  >
> = {
  bestRated: { desc: "Reviews_DESC", asc: "Reviews_DESC" },
  releaseDate: { desc: "Released_DESC", asc: "Released_ASC" },
  alphabetical: { asc: "Name_ASC", desc: "Name_DESC" },
};

export const toSteamSearchQuery = (
  filters: CatalogueSearchPayload,
  avoidTags: readonly number[]
): SteamSearchQuery => ({
  term: filters.title,
  tags: filters.tags,
  untags: getBrowseExclusions(filters, avoidTags),
  sortBy: STEAM_SORTS[filters.sortBy]?.[filters.sortOrder],
  categories: (filters.players ?? []).map(
    (player) => BROWSE_PLAYER_CATEGORIES[player]
  ),
});

/** The request for Hydra's search: the Browse-only fields go, and Best rated falls back to Most reviewed. */
export const toHydraSearchPayload = (
  filters: CatalogueSearchPayload
): Omit<CatalogueSearchPayload, "excludeTags" | "players" | "useAvoidList"> => {
  const {
    excludeTags: _excludeTags,
    players: _players,
    useAvoidList: _useAvoidList,
    ...payload
  } = filters;
  return payload.sortBy === "bestRated"
    ? { ...payload, sortBy: "reviewScore", sortOrder: "desc" }
    : payload;
};

/** For `hydra-filtered`: whether a loaded game passes what Hydra's search could not do. */
export const passesBrowseExtras = (
  facts: { tags: number[]; players: number[] } | undefined,
  filters: CatalogueSearchPayload,
  avoidTags: readonly number[]
) => {
  // Facts not known: keep the game rather than hide it by mistake.
  if (!facts) return true;
  const excluded = new Set(getBrowseExclusions(filters, avoidTags));
  if (facts.tags.some((tag) => excluded.has(tag))) return false;
  return (filters.players ?? []).every((player) =>
    facts.players.includes(BROWSE_PLAYER_CATEGORIES[player])
  );
};
