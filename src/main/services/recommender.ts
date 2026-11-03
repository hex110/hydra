import { createHash } from "node:crypto";
import {
  buildCatalogueIdf,
  buildIdf,
  buildTasteProfile,
  DEFAULT_TUNE_OPTIONS,
  diversify,
  expandTagFamilies,
  getDisplayedPlayTimeInMilliseconds,
  groupFromTags,
  groupPickedGames,
  groupSeeds,
  buildCustomGroup,
  proposeAround,
  proposeRefinements,
  withoutMultiplayer,
  type GroupProposal,
  type WeightedSeed,
  interleaveGroups,
  isFinishedGame,
  rankCandidates,
  STEAM_GAME_TYPE,
  toPlayActivityDate,
  toProfileGroup,
  toRecommendation,
  type BuiltGroup,
  type LibraryFacets,
  type PoolCandidate,
  type RecommendationResponse,
  type ScoredCandidate,
  type SeedInput,
  type StoreItem,
  type TuneOptions,
  type TuneProtonMinimum,
} from "@shared";
import type { Game } from "@types";
import {
  catalogueImpressionsSublevel,
  catalogueNotInterestedSublevel,
  catalogueTasteSublevel,
  downloadSourcesSublevel,
  gamesSublevel,
} from "@main/level";
import { HydraApi } from "./hydra-api";
import { logger } from "./logger";
import { getPlayActivity } from "./play-activity";
import { getCatalogueRowDetails } from "./catalogue-row-details";
import { getCriticScores } from "./critic-scores";
import {
  getCatalogueSnapshot,
  setCatalogueSnapshot,
} from "./catalogue-snapshots";
import { getFacetCounts } from "./catalogue-facet-counts";
import { getProtonDbTiers } from "./protondb";
import { getStoreRankedCandidates } from "./catalogue-charts";
import { getLastBuildUpdate } from "./steam-build-dates";
import { getStoreItems } from "./steam-store-items";
import { getSteamSimilarGames } from "./steam-similar";
import { searchSteamStorePages } from "./steam-store-search";

const CACHE_MS = 6 * 60 * 60 * 1000;
const RECENT_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
/** Every game played or rated counts, up to this many. */
const MAX_LIBRARY_SEEDS = 1500;
const SEARCH_TAKE = 40;
/** A group's heaviest games whose "More like this" lists are fetched. */
const SIMILAR_GAMES = 3;
const SIMILAR_CONCURRENCY = 3;
const STEAM_SEARCH_PAGES = 2;
/** How many top candidates the filters that need a request look at. */
const NETWORK_FILTER_DEPTH = 150;
const RESULT_LIMIT = 120;
/** The most games `getCatalogueRowDetails` takes at once. */
const ROW_DETAILS_CHUNK = 60;
/** Finished games need a steamcmd.net request each, a second apart. */
const FINISHED_WANTED = 24;
const SEARCH_SORTS = ["hydraScore", "popularity"] as const;
/** Elsewhere-played games count as this many hours, before their rating. */
const ELSEWHERE_HOURS = 10;

const PROTON_ORDER = ["borked", "bronze", "silver", "gold", "platinum"];
const PROTON_MINIMUM_BADGES: Record<TuneProtonMinimum, string[]> = {
  any: [],
  silver: ["silver", "gold", "platinum"],
  gold: ["gold", "platinum"],
  platinum: ["platinum"],
};
const LENGTH_HOURS = {
  short: [0, 5],
  medium: [5, 15],
  long: [15, 40],
  epic: [40, Infinity],
} as const;

interface LibraryData {
  at: number;
  key: string;
  inputs: SeedInput[];
  ownedKeys: Set<string>;
  /** Played or rated games Steam has no tags for. */
  untaggedCount: number;
}

interface Pool {
  at: number;
  /** Downloadable only was asked for and there is no download source to ask. */
  noSources: boolean;
  candidates: PoolCandidate[];
  /** Steam ids that came from a search limited to the person's download sources. */
  downloadable: Set<string> | null;
}

let libraryCache: Promise<LibraryData> | null = null;
let libraryCachedAt = 0;
const poolCache = new Map<string, Promise<Pool>>();
let idfCache: { checkedAt: number; idf: Map<number, number> } | null = null;

const steamAppId = (game: Game) => {
  const identity = game.catalogueGame ?? game;
  return identity.shop === "steam" ? identity.objectId : null;
};

const hash = (value: unknown) =>
  createHash("sha1").update(JSON.stringify(value)).digest("hex").slice(0, 16);

/** The library as one entry per Steam game, with the tags Steam gives it. */
const loadLibrary = async (): Promise<LibraryData> => {
  const games = (await gamesSublevel.values().all()).filter(
    (game) => !game.isDeleted
  );
  const activity = await getPlayActivity(
    toPlayActivityDate(new Date(Date.now() - RECENT_DAYS * DAY_MS))
  );
  const recentByKey = new Map<string, number>();
  for (const day of activity) {
    for (const [key, ms] of Object.entries(day.games)) {
      recentByKey.set(key, (recentByKey.get(key) ?? 0) + ms);
    }
  }

  const ownedKeys = new Set<string>();
  const byApp = new Map<string, Omit<SeedInput, "tags">>();

  for (const game of games) {
    ownedKeys.add(`${game.shop}:${game.objectId}`);
    if (game.catalogueGame) {
      ownedKeys.add(
        `${game.catalogueGame.shop}:${game.catalogueGame.objectId}`
      );
    }

    const appId = steamAppId(game);
    if (!appId) continue;

    const hours = getDisplayedPlayTimeInMilliseconds(game) / HOUR_MS;
    const recentHours =
      (recentByKey.get(`${game.shop}:${game.objectId}`) ?? 0) / HOUR_MS;
    const current = byApp.get(appId);

    // Copies of one game (Steam and a download) overlap, so the larger counts.
    byApp.set(appId, {
      key: `steam:${appId}`,
      appId,
      title: game.title,
      hours: Math.max(current?.hours ?? 0, hours),
      recentHours: Math.max(current?.recentHours ?? 0, recentHours),
      rating: game.rating ?? current?.rating ?? null,
      status: game.playStatus ?? current?.status ?? null,
      wishlisted: Boolean(game.wishlisted) || Boolean(current?.wishlisted),
    });
  }

  const useful = [...byApp.values()]
    .filter(
      (entry) =>
        entry.hours > 0 ||
        entry.rating !== null ||
        entry.status !== null ||
        entry.wishlisted
    )
    .sort((a, b) => b.hours - a.hours)
    .slice(0, MAX_LIBRARY_SEEDS);

  const items = await getStoreItems(useful.map((entry) => entry.appId));
  const inputs: SeedInput[] = useful.flatMap((entry) => {
    const item = items.get(entry.appId);
    return item && item.type === STEAM_GAME_TYPE && item.tags.length > 0
      ? [{ ...entry, title: item.title || entry.title, tags: item.tags }]
      : [];
  });

  return {
    at: Date.now(),
    key: hash(
      inputs.map((input) => [
        input.key,
        Math.round(input.hours),
        Math.round(input.recentHours),
        input.rating,
        input.status,
        input.wishlisted,
      ])
    ),
    inputs,
    ownedKeys,
    untaggedCount: useful.length - inputs.length,
  };
};

const getLibrary = (): Promise<LibraryData> => {
  if (!libraryCache || Date.now() - libraryCachedAt > CACHE_MS) {
    libraryCachedAt = Date.now();
    libraryCache = loadLibrary().catch((error) => {
      libraryCache = null;
      throw error;
    });
  }
  return libraryCache;
};

/** Forgets what was read from the library, e.g. after a rating or status changes. */
export const resetRecommenderLibrary = () => {
  libraryCache = null;
};

const searchSteamIds = async (
  tagId: number,
  sortBy: (typeof SEARCH_SORTS)[number],
  options: TuneOptions,
  sources: { ids: string[]; fingerprints: string[] }
): Promise<string[] | null> => {
  try {
    const response = await HydraApi.post<{
      edges?: { shop: string; objectId: string }[];
    }>(
      "/catalogue/search",
      {
        title: "",
        sortBy,
        sortOrder: "desc",
        downloadSourceFingerprints: options.downloadableOnly
          ? sources.fingerprints
          : [],
        downloadSourceIds: options.downloadableOnly ? sources.ids : [],
        tags: [tagId],
        publishers: [],
        genres: [],
        developers: [],
        protondbSupportBadges: PROTON_MINIMUM_BADGES[options.protonMinimum],
        deckCompatibility: [],
        ...(options.years ? { releaseYear: options.years } : {}),
        take: SEARCH_TAKE,
        skip: 0,
      },
      { needsAuth: false }
    );

    return (response?.edges ?? [])
      .filter((game) => game.shop === "steam")
      .map((game) => game.objectId);
  } catch (error) {
    logger.warn(`[Recommender] Search for tag ${tagId} failed`, error);
    return null;
  }
};

/** Tag rarity over the whole catalogue, from the daily facet counts; empty before the first run. */
const getCatalogueIdf = async () => {
  const counts = await getFacetCounts().catch(() => null);
  if (!counts?.total) return new Map<number, number>();
  if (idfCache?.checkedAt !== counts.checkedAt) {
    idfCache = {
      checkedAt: counts.checkedAt,
      idf: buildCatalogueIdf(counts.tags, counts.total),
    };
  }
  return idfCache.idf;
};

/** Games chosen in Games mode or logged as played elsewhere, which the library doesn't have. */
const loadOutsideSeeds = async (
  library: LibraryData,
  options: TuneOptions
): Promise<SeedInput[]> => {
  const stored = await catalogueTasteSublevel
    .get("settings")
    .catch(() => undefined);
  const elsewhere = stored?.playedElsewhere ?? {};
  const inLibrary = new Set(library.inputs.map((input) => input.key));

  const wanted = new Map<string, { rating: number | null }>();
  for (const [appId, entry] of Object.entries(elsewhere)) {
    wanted.set(`steam:${appId}`, { rating: entry.rating ?? null });
  }
  if (options.basedOn === "games") {
    for (const key of options.pickedGames) {
      if (!wanted.has(key)) wanted.set(key, { rating: null });
    }
  }

  const keys = [...wanted.keys()].filter(
    (key) => key.startsWith("steam:") && !inLibrary.has(key)
  );
  if (keys.length === 0) return [];

  const items = await getStoreItems(keys.map((key) => key.slice(6)));
  return keys.flatMap((key) => {
    const item = items.get(key.slice(6));
    if (!item || item.type !== STEAM_GAME_TYPE || item.tags.length === 0)
      return [];
    const isElsewhere = key.slice(6) in elsewhere;
    return [
      {
        key,
        appId: item.appId,
        title: item.title,
        hours: isElsewhere ? ELSEWHERE_HOURS : 0,
        recentHours: 0,
        rating: wanted.get(key)?.rating ?? null,
        status: null,
        wishlisted: false,
        tags: item.tags,
        elsewhere: true,
      },
    ];
  });
};

/** Keys of everything that should not be suggested: owned and played elsewhere. */
const getHiddenKeys = async (library: LibraryData) => {
  const stored = await catalogueTasteSublevel
    .get("settings")
    .catch(() => undefined);
  const hidden = new Set(library.ownedKeys);
  for (const appId of Object.keys(stored?.playedElsewhere ?? {})) {
    hidden.add(`steam:${appId}`);
  }
  return hidden;
};

const getImpressions = async () => {
  const entries: [string, { count: number }][] =
    await catalogueImpressionsSublevel
      .iterator()
      .all()
      .catch(() => []);
  return new Map<string, number>(
    entries.map(([appId, value]) => [appId, value.count])
  );
};

/** Notes that suggested games were on screen; opening a game page forgets them. */
export const recordImpressions = async (appIds: string[]) => {
  const unique = [...new Set(appIds)].slice(0, 200);
  if (unique.length === 0) return;
  const current = await catalogueImpressionsSublevel
    .getMany(unique)
    .catch(() => unique.map(() => undefined));
  const batch = catalogueImpressionsSublevel.batch();
  unique.forEach((appId, index) => {
    batch.put(appId, {
      count: (current[index]?.count ?? 0) + 1,
      lastAt: Date.now(),
    });
  });
  await batch.write().catch((error) => {
    logger.warn("[Recommender] Could not record impressions", error);
  });
};

export const forgetImpressions = async (appId: string) => {
  await catalogueImpressionsSublevel.del(appId).catch(() => undefined);
};

const searchSteamStoreIds = async (group: BuiltGroup, options: TuneOptions) => {
  const tags = group.id === "tags" ? group.anchors : group.anchors.slice(0, 2);
  if (tags.length === 0) return [];
  const untags = options.avoidRelated
    ? expandTagFamilies(options.avoidTags)
    : options.avoidTags;
  // Two anchors together can be too narrow; the first alone backs them up.
  const lists = await Promise.all([
    searchSteamStorePages(
      { tags, untags, sortBy: "Reviews_DESC" },
      STEAM_SEARCH_PAGES
    ),
    tags.length > 1
      ? searchSteamStorePages(
          { tags: tags.slice(0, 1), untags, sortBy: "Reviews_DESC" },
          1
        )
      : Promise.resolve([]),
  ]);
  return lists.flatMap((list) => list ?? []);
};

/**
 * One group's candidates: Steam's "More like this" for its heaviest games
 * (the behaviour signal), Hydra's search for each anchor tag, Steam's store
 * search for its leading anchors with the avoid list left out, and the most
 * reviewed games of the last year.
 */
const buildPool = async (
  group: BuiltGroup,
  options: TuneOptions,
  hidden: Set<string>
): Promise<Pool> => {
  const seeds = group.seeds
    .filter((seed) => seed.weight > 0)
    .slice(0, SIMILAR_GAMES);

  const behaviour = new Map<string, { seedKey: string; place: number }[]>();
  let next = 0;
  const worker = async () => {
    while (next < seeds.length) {
      const seed = seeds[next++];
      const list = await getSteamSimilarGames(seed.appId);
      list?.forEach((game, index) => {
        const places = behaviour.get(game.objectId) ?? [];
        places.push({ seedKey: seed.key, place: 1 - index / list.length });
        behaviour.set(game.objectId, places);
      });
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(SIMILAR_CONCURRENCY, seeds.length) }, worker)
  );

  const sources = await downloadSourcesSublevel
    .values()
    .all()
    .catch(() => []);
  const sourceFilter = {
    ids: sources.map((source) => source.id),
    fingerprints: sources.flatMap((source) =>
      source.fingerprint ? [source.fingerprint] : []
    ),
  };

  if (options.downloadableOnly && sourceFilter.fingerprints.length === 0) {
    return {
      at: Date.now(),
      noSources: true,
      candidates: [],
      downloadable: null,
    };
  }

  const searchTags = [...new Set([...options.leanTags, ...group.anchors])];
  const searched = new Set<string>();
  for (const tagId of searchTags) {
    for (const sortBy of SEARCH_SORTS) {
      const ids = await searchSteamIds(tagId, sortBy, options, sourceFilter);
      ids?.forEach((id) => searched.add(id));
    }
  }

  const [steamSearched, released] = options.downloadableOnly
    ? [[], { appIds: [] as string[] }]
    : await Promise.all([
        searchSteamStoreIds(group, options),
        getStoreRankedCandidates({ preset: "12m" }),
      ]);

  const wanted = options.downloadableOnly
    ? searched
    : new Set([
        ...behaviour.keys(),
        ...searched,
        ...steamSearched,
        ...released.appIds,
      ]);
  const ids = [...wanted].filter((id) => !hidden.has(`steam:${id}`));
  const [items, critics] = await Promise.all([
    getStoreItems(ids),
    getCriticScores(ids),
  ]);

  const candidates = ids.flatMap((id) => {
    const item: StoreItem | null | undefined = items.get(id);
    return item && item.type === STEAM_GAME_TYPE
      ? [
          {
            ...toCandidate(item),
            criticScore: critics.get(id) ?? null,
            behaviour: behaviour.get(id) ?? [],
          },
        ]
      : [];
  });

  return {
    at: Date.now(),
    noSources: false,
    candidates,
    downloadable: options.downloadableOnly ? searched : null,
  };
};

const toCandidate = (item: StoreItem): PoolCandidate => ({
  appId: item.appId,
  title: item.title,
  tags: item.tags,
  reviewCount: item.reviewCount,
  reviewPercent: item.reviewPercent,
  reviewLabel: item.reviewLabel,
  releaseDate: item.releaseDate,
  isEarlyAccess: item.isEarlyAccess,
  type: item.type,
  playerCategories: item.playerCategories,
  developers: item.developers,
  publishers: item.publishers,
  headerImageUrl: item.headerImageUrl,
  behaviour: [],
});

/** What decides which games are fetched for a group; sliders and most filters are not part of it. */
const getPoolKey = (
  group: BuiltGroup,
  options: TuneOptions,
  library: LibraryData
) =>
  hash({
    group: group.id,
    anchors: group.anchors,
    seeds: group.seeds
      .filter((seed) => seed.weight > 0)
      .slice(0, SIMILAR_GAMES)
      .map((seed) => seed.key),
    lean: options.leanTags,
    avoid: options.avoidTags,
    years: options.years,
    proton: options.protonMinimum,
    downloadable: options.downloadableOnly,
    library: library.key,
  });

interface StoredPool extends Omit<Pool, "downloadable"> {
  downloadable: string[] | null;
}

/** A pool fetched in the last six hours survives a restart, so the first suggestions need no requests. */
const loadStoredPool = async (key: string): Promise<Pool | null> => {
  const stored = await getCatalogueSnapshot<StoredPool>(`pool:${key}`);
  if (!stored || Date.now() - stored.data.at > CACHE_MS) return null;
  return {
    ...stored.data,
    downloadable: stored.data.downloadable
      ? new Set(stored.data.downloadable)
      : null,
  };
};

const storePool = (key: string, pool: Pool) =>
  setCatalogueSnapshot(`pool:${key}`, {
    ...pool,
    downloadable: pool.downloadable ? [...pool.downloadable] : null,
  } satisfies StoredPool);

const getPool = (
  group: BuiltGroup,
  options: TuneOptions,
  library: LibraryData,
  hidden: Set<string>
): Promise<Pool> => {
  const key = getPoolKey(group, options, library);
  const cached = poolCache.get(key);
  if (cached) return cached;

  const pool = loadStoredPool(key)
    .then(
      (stored) =>
        stored ??
        buildPool(group, options, hidden).then((built) => {
          if (built.candidates.length > 0) void storePool(key, built);
          return built;
        })
    )
    .catch((error) => {
      poolCache.delete(key);
      throw error;
    });
  poolCache.set(key, pool);
  setTimeout(() => poolCache.delete(key), CACHE_MS).unref?.();

  // Older pools are of no use once the settings have moved on.
  for (const old of [...poolCache.keys()].slice(0, -12)) poolCache.delete(old);
  return pool;
};

const getNotInterestedKeys = async () =>
  new Set(
    await catalogueNotInterestedSublevel
      .keys()
      .all()
      .catch(() => [] as string[])
  );

const protonRank = (tier: string | null) => {
  if (tier === "native") return PROTON_ORDER.length;
  return tier ? PROTON_ORDER.indexOf(tier) : -1;
};

/** Games with a tier at or above the minimum, in the same order. */
const filterByProton = async (
  ranked: ScoredCandidate[],
  minimum: TuneProtonMinimum,
  leftOut: RecommendationResponse["leftOut"]
) => {
  if (minimum === "any") return ranked;

  const tiers = await getProtonDbTiers(
    ranked.map((item) => item.candidate.appId)
  );
  const floor = PROTON_ORDER.indexOf(minimum);
  return ranked.filter((item) => {
    const tier = tiers[item.candidate.appId] ?? null;
    if (tier === null) {
      leftOut.tierUnknown++;
      return false;
    }
    return protonRank(tier) >= floor;
  });
};

const filterByLength = async (
  ranked: ScoredCandidate[],
  length: NonNullable<TuneOptions["length"]>,
  leftOut: RecommendationResponse["leftOut"]
) => {
  const facts: Awaited<ReturnType<typeof getCatalogueRowDetails>> = {};
  for (let index = 0; index < ranked.length; index += ROW_DETAILS_CHUNK) {
    Object.assign(
      facts,
      await getCatalogueRowDetails(
        ranked.slice(index, index + ROW_DETAILS_CHUNK).map((item) => ({
          shop: "steam" as const,
          objectId: item.candidate.appId,
          title: item.candidate.title,
        }))
      )
    );
  }
  const [from, to] = LENGTH_HOURS[length];

  return ranked.filter((item) => {
    const hours = facts[`steam:${item.candidate.appId}`]?.howLongToBeatHours;
    if (hours === null || hours === undefined) {
      leftOut.lengthUnknown++;
      return false;
    }
    return hours >= from && hours < to;
  });
};

/** Walks down the list asking steamcmd.net until enough games qualify; unknown dates are left out and counted. */
const filterByFinished = async (
  ranked: ScoredCandidate[],
  leftOut: RecommendationResponse["leftOut"]
) => {
  const now = Date.now();
  const kept: ScoredCandidate[] = [];

  for (const item of ranked) {
    if (kept.length >= FINISHED_WANTED) break;
    const facts = {
      releaseDate: item.candidate.releaseDate,
      isEarlyAccess: item.candidate.isEarlyAccess,
    };
    // Not worth a request when the release date already rules it out.
    if (isFinishedGame(facts, 0, now) === false) continue;

    const builtAt = await getLastBuildUpdate(item.candidate.appId);
    const finished = isFinishedGame(facts, builtAt, now);
    if (finished === null) leftOut.buildDateUnknown++;
    else if (finished) kept.push(item);
  }
  return kept;
};

/**
 * The library's taste groups as the person shaped them: the automatic ones
 * (each with its multiplayer games left out when asked, hidden ones marked)
 * and the ones they made, which replace nothing on their own.
 */
const buildLibraryGroups = (
  seeds: WeightedSeed[],
  options: TuneOptions,
  idf: ReadonlyMap<number, number>
): BuiltGroup[] => {
  const allWeight = seeds.reduce((sum, seed) => sum + Math.abs(seed.weight), 0);
  const settingsOf = (id: string) => options.groupSettings[id] ?? {};

  const custom = options.customGroups.flatMap((entry) => {
    const group = buildCustomGroup(entry, seeds, allWeight, idf);
    return group ? [group] : [];
  });
  const groups = [...custom, ...groupSeeds(seeds, idf)].map((group) => {
    const settings = settingsOf(group.id);
    const shaped = settings.leaveOutMultiplayer
      ? withoutMultiplayer(group, idf)
      : group;
    return { ...shaped, isHidden: settings.hidden === true };
  });

  // Shares among the groups that mix, so Mix all still adds up.
  const mixing = groups.filter((group) => !group.isHidden);
  const total = mixing.reduce((sum, group) => sum + group.weight, 0);
  return groups.map((group) => ({
    ...group,
    share: total > 0 && !group.isHidden ? group.weight / total : group.share,
  }));
};

/**
 * Groups Hydra offers: a group's games split two or three ways (Refine), or a
 * tight, medium and broad group around one to three library games.
 */
export const getGroupProposals = async (
  request:
    | { kind: "refine"; groupId: string; options: Partial<TuneOptions> }
    | { kind: "around"; gameKeys: string[]; options: Partial<TuneOptions> }
): Promise<GroupProposal[]> => {
  try {
    const options: TuneOptions = {
      ...DEFAULT_TUNE_OPTIONS,
      ...request.options,
      basedOn: "groups",
    };
    const library = await getLibrary();
    const outside = await loadOutsideSeeds(library, options);
    const built = buildTasteProfile([...library.inputs, ...outside], options);
    const catalogueIdf = await getCatalogueIdf();
    const idf =
      catalogueIdf.size > 0
        ? catalogueIdf
        : buildIdf([...library.inputs, ...outside].map((input) => input.tags));

    if (request.kind === "around") {
      return proposeAround(built.seeds, request.gameKeys.slice(0, 3), idf);
    }
    const group = buildLibraryGroups(built.seeds, options, idf).find(
      (entry) => entry.id === request.groupId
    );
    return group ? proposeRefinements(group, idf) : [];
  } catch (error) {
    logger.warn("[Recommender] Could not propose groups", error);
    return [];
  }
};

const emptyResponse = (
  extra: Partial<RecommendationResponse> = {}
): RecommendationResponse => ({
  profile: {
    seeds: [],
    tags: [],
    dominantFamily: null,
    seedCount: 0,
    groups: [],
    untaggedCount: 0,
  },
  results: [],
  group: "all",
  leftOut: { buildDateUnknown: 0, tierUnknown: 0, lengthUnknown: 0 },
  noDownloadSources: false,
  failed: false,
  ...extra,
});

/**
 * Suggestions from the library's taste groups (or chosen games, or chosen
 * tags): each group finds its own candidates and ranks them by how well they
 * fit the group, with a rare anchor tag required near the top; Mix all
 * interleaves the groups by their share. The Tune options re-rank and filter;
 * only a change in which games to look for fetches again.
 */
export const getRecommendations = async (
  partial: Partial<TuneOptions>
): Promise<RecommendationResponse> => {
  const options: TuneOptions = { ...DEFAULT_TUNE_OPTIONS, ...partial };
  const leftOut = { buildDateUnknown: 0, tierUnknown: 0, lengthUnknown: 0 };

  try {
    const library = await getLibrary();
    const [outside, idf, hidden, notInterested, impressions] =
      await Promise.all([
        loadOutsideSeeds(library, options),
        getCatalogueIdf(),
        getHiddenKeys(library),
        getNotInterestedKeys(),
        getImpressions(),
      ]);
    const built = buildTasteProfile([...library.inputs, ...outside], options);
    // Before the first catalogue count, rarity within the library still beats none.
    const rarity =
      idf.size > 0
        ? idf
        : buildIdf([...library.inputs, ...outside].map((input) => input.tags));

    const groups =
      options.basedOn === "tags"
        ? groupFromTags(options.seedTags)
        : options.basedOn === "games"
          ? groupPickedGames(built.seeds, rarity)
          : buildLibraryGroups(built.seeds, options, rarity);

    const profile = {
      ...built.profile,
      groups: groups.map(toProfileGroup),
      untaggedCount: library.untaggedCount,
    };
    if (groups.length === 0) return emptyResponse({ profile, leftOut });

    const chosen = groups.find((group) => group.id === options.group);
    const shown = chosen ? [chosen] : groups.filter((group) => !group.isHidden);
    if (shown.length === 0) return emptyResponse({ profile, leftOut });

    const lists: { share: number; items: ScoredCandidate[] }[] = [];
    let anyCandidates = false;
    for (const group of shown) {
      const pool = await getPool(group, options, library, hidden);
      if (pool.noSources) {
        return emptyResponse({ profile, leftOut, noDownloadSources: true });
      }
      anyCandidates ||= pool.candidates.length > 0;

      let candidates = pool.candidates.filter(
        (candidate) =>
          !notInterested.has(`steam:${candidate.appId}`) &&
          !hidden.has(`steam:${candidate.appId}`)
      );
      if (pool.downloadable) {
        const allowed = pool.downloadable;
        candidates = candidates.filter((candidate) =>
          allowed.has(candidate.appId)
        );
      }

      // Leaving out multiplayer also keeps multiplayer games out of the suggestions.
      const groupOptions =
        group.leaveOutMultiplayer || options.leaveOutMultiplayer
          ? { ...options, singleplayerOnly: true }
          : options;
      const ranked = rankCandidates(candidates, group, groupOptions, {
        idf: idf.size > 0 ? idf : undefined,
        impressions,
      });
      lists.push({
        share: group.share,
        items: diversify(ranked, NETWORK_FILTER_DEPTH),
      });
    }

    let shortlist =
      lists.length === 1
        ? lists[0].items
        : interleaveGroups(lists, NETWORK_FILTER_DEPTH);
    shortlist = await filterByProton(shortlist, options.protonMinimum, leftOut);
    if (options.length) {
      shortlist = await filterByLength(shortlist, options.length, leftOut);
    }
    if (options.finishedOnly) {
      shortlist = await filterByFinished(shortlist, leftOut);
    }

    return {
      profile,
      results: shortlist.slice(0, RESULT_LIMIT).map(toRecommendation),
      group: chosen ? chosen.id : "all",
      leftOut,
      noDownloadSources: false,
      failed: !anyCandidates,
    };
  } catch (error) {
    logger.error("[Recommender] Could not make suggestions", error);
    return emptyResponse({ leftOut, failed: true });
  }
};

const FACET_TAGS = 8;
const FACET_NAMES = 10;
const FACET_GAMES = 60;

/**
 * What the library suggests as filters: the tags with the most playtime
 * behind them (idle games discounted, as for suggestions) and the developers
 * and publishers of the most played games.
 */
export const getLibraryFacets = async (): Promise<LibraryFacets> => {
  const empty = { tagIds: [], developers: [], publishers: [] };

  try {
    const library = await getLibrary();
    const { profile } = buildTasteProfile(library.inputs, DEFAULT_TUNE_OPTIONS);

    const played = library.inputs
      .filter((input) => input.hours > 0)
      .sort((a, b) => b.hours - a.hours)
      .slice(0, FACET_GAMES);
    const items = await getStoreItems(played.map((input) => input.appId));

    const tally = (pick: (item: StoreItem) => string[]) => {
      const totals = new Map<string, number>();
      for (const input of played) {
        const item = items.get(input.appId);
        for (const name of item ? pick(item) : []) {
          totals.set(name, (totals.get(name) ?? 0) + input.hours);
        }
      }
      return [...totals]
        .sort((a, b) => b[1] - a[1])
        .slice(0, FACET_NAMES)
        .map(([name]) => name);
    };

    return {
      tagIds: profile.tags.slice(0, FACET_TAGS).map((tag) => tag.tagId),
      developers: tally((item) => item.developers),
      publishers: tally((item) => item.publishers),
    };
  } catch (error) {
    logger.warn("[Recommender] Could not read the library's facets", error);
    return empty;
  }
};
