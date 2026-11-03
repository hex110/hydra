import { createHash } from "node:crypto";
import {
  buildTasteProfile,
  DEFAULT_TUNE_OPTIONS,
  diversify,
  getDisplayedPlayTimeInMilliseconds,
  isFinishedGame,
  pickRetrievalSeeds,
  rankCandidates,
  STEAM_GAME_TYPE,
  toPlayActivityDate,
  toRecommendation,
  type BecauseShelf,
  type LibraryFacets,
  type BuiltProfile,
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
  catalogueNotInterestedSublevel,
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
import { getProtonDbTiers } from "./protondb";
import { getTopReleases } from "./steam-charts";
import { getLastBuildUpdate } from "./steam-build-dates";
import { getStoreItems } from "./steam-store-items";
import { getSteamSimilarGames } from "./steam-similar";

const CACHE_MS = 6 * 60 * 60 * 1000;
const RECENT_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MAX_LIBRARY_SEEDS = 400;
const SEARCH_TAGS = 6;
const SEARCH_TAKE = 40;
const SIMILAR_CONCURRENCY = 3;
const RELEASE_MONTHS = 12;
/** How many top candidates the filters that need a request look at. */
const NETWORK_FILTER_DEPTH = 150;
const RESULT_LIMIT = 120;
/** The most games `getCatalogueRowDetails` takes at once. */
const ROW_DETAILS_CHUNK = 60;
const BECAUSE_SHELVES = 2;
const BECAUSE_SIZE = 12;
/** Finished games need a steamcmd.net request each, a second apart. */
const FINISHED_WANTED = 24;
const SEARCH_SORTS = ["hydraScore", "popularity"] as const;

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
    return item && item.type === STEAM_GAME_TYPE
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

const buildPool = async (
  built: BuiltProfile,
  options: TuneOptions,
  library: LibraryData
): Promise<Pool> => {
  const seeds = pickRetrievalSeeds(built.seeds, options);

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

  const searchTags = [
    ...new Set([
      ...options.leanTags,
      ...built.profile.tags.map((tag) => tag.tagId),
    ]),
  ].slice(0, SEARCH_TAGS);

  const searched = new Set<string>();
  for (const tagId of searchTags) {
    for (const sortBy of SEARCH_SORTS) {
      const ids = await searchSteamIds(tagId, sortBy, options, sourceFilter);
      ids?.forEach((id) => searched.add(id));
    }
  }

  const releases = (await getTopReleases())?.slice(0, RELEASE_MONTHS) ?? [];
  const released = new Set(releases.flatMap((month) => month.appIds));

  const wanted = options.downloadableOnly
    ? searched
    : new Set([...behaviour.keys(), ...searched, ...released]);
  const ids = [...wanted].filter((id) => !library.ownedKeys.has(`steam:${id}`));
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

/** What decides which games are fetched; sliders and filters are not part of it. */
const getPoolKey = (
  built: BuiltProfile,
  options: TuneOptions,
  library: LibraryData
) =>
  hash({
    seeds: pickRetrievalSeeds(built.seeds, options).map((seed) => seed.key),
    tags: [
      ...options.leanTags,
      ...built.profile.tags.map((tag) => tag.tagId),
    ].slice(0, SEARCH_TAGS),
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
  built: BuiltProfile,
  options: TuneOptions,
  library: LibraryData
): Promise<Pool> => {
  const key = getPoolKey(built, options, library);
  const cached = poolCache.get(key);
  if (cached) return cached;

  const pool = loadStoredPool(key)
    .then(
      (stored) =>
        stored ??
        buildPool(built, options, library).then((built) => {
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
  for (const old of [...poolCache.keys()].slice(0, -6)) poolCache.delete(old);
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

const toBecauseShelves = (
  built: BuiltProfile,
  ranked: ScoredCandidate[],
  options: TuneOptions
): BecauseShelf[] =>
  pickRetrievalSeeds(built.seeds, options)
    .slice(0, BECAUSE_SHELVES)
    .map((seed) => ({
      seed: { key: seed.key, appId: seed.appId, title: seed.title },
      results: ranked
        .filter((item) =>
          item.candidate.behaviour.some((entry) => entry.seedKey === seed.key)
        )
        .slice(0, BECAUSE_SIZE)
        .map(toRecommendation),
    }))
    .filter((shelf) => shelf.results.length > 0);

/**
 * Suggestions for the whole library: what the person likes is learned from
 * playtime, ratings and status (idle games discounted), candidates come from
 * Steam's "More like this" lists, tag searches and new releases, and are
 * ranked by tag similarity, those lists and review quality. The Tune options
 * re-rank and filter; only a change in which games to look for fetches again.
 */
export const getRecommendations = async (
  partial: Partial<TuneOptions>
): Promise<RecommendationResponse> => {
  const options: TuneOptions = { ...DEFAULT_TUNE_OPTIONS, ...partial };
  const leftOut = { buildDateUnknown: 0, tierUnknown: 0, lengthUnknown: 0 };

  try {
    const library = await getLibrary();
    const built = buildTasteProfile(library.inputs, options);

    if (built.seeds.every((seed) => seed.weight <= 0)) {
      return {
        profile: built.profile,
        results: [],
        because: [],
        leftOut,
        noDownloadSources: false,
        failed: false,
      };
    }

    const [pool, notInterested] = await Promise.all([
      getPool(built, options, library),
      getNotInterestedKeys(),
    ]);

    if (pool.noSources) {
      return {
        profile: built.profile,
        results: [],
        because: [],
        leftOut,
        noDownloadSources: true,
        failed: false,
      };
    }

    let candidates = pool.candidates.filter(
      (candidate) => !notInterested.has(`steam:${candidate.appId}`)
    );
    if (pool.downloadable) {
      const allowed = pool.downloadable;
      candidates = candidates.filter((candidate) =>
        allowed.has(candidate.appId)
      );
    }

    const ranked = rankCandidates(
      candidates,
      built.vector,
      built.seeds,
      options
    );
    const because = toBecauseShelves(built, ranked, options);

    let shortlist = ranked.slice(0, NETWORK_FILTER_DEPTH);
    shortlist = await filterByProton(shortlist, options.protonMinimum, leftOut);
    if (options.length) {
      shortlist = await filterByLength(shortlist, options.length, leftOut);
    }
    if (options.finishedOnly) {
      shortlist = await filterByFinished(shortlist, leftOut);
    }

    return {
      profile: built.profile,
      results: diversify(shortlist, RESULT_LIMIT).map(toRecommendation),
      because,
      leftOut,
      noDownloadSources: false,
      failed: pool.candidates.length === 0,
    };
  } catch (error) {
    logger.error("[Recommender] Could not make suggestions", error);
    return {
      profile: { seeds: [], tags: [], dominantFamily: null, seedCount: 0 },
      results: [],
      because: [],
      leftOut,
      noDownloadSources: false,
      failed: true,
    };
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
