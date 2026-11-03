import type { FacetCounts } from "@shared";
import { catalogueFacetCountsSublevel } from "@main/level";
import { HydraApi } from "./hydra-api";
import { logger } from "./logger";
import { getSteamTagNamesById } from "./steam-tags";
import { WindowManager } from "./window-manager";

const KEY = "counts";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const CONCURRENCY = 4;
const UPDATED_EVENT = "on-catalogue-facet-counts-updated";

let running: Promise<void> | null = null;

const countGames = async (filter: {
  tags?: number[];
  genres?: string[];
}): Promise<number | null> => {
  try {
    const response = await HydraApi.post<{ count?: number }>(
      "/catalogue/search",
      {
        title: "",
        sortBy: "popularity",
        sortOrder: "desc",
        downloadSourceFingerprints: [],
        downloadSourceIds: [],
        tags: filter.tags ?? [],
        publishers: [],
        genres: filter.genres ?? [],
        developers: [],
        protondbSupportBadges: [],
        deckCompatibility: [],
        take: 5,
        skip: 0,
      },
      { needsAuth: false }
    );
    return typeof response?.count === "number" ? response.count : null;
  } catch {
    return null;
  }
};

const read = () => catalogueFacetCountsSublevel.get(KEY).catch(() => undefined);

/** The counts kept from the last run, or null before the first one finishes. */
export const getFacetCounts = async (): Promise<FacetCounts | null> =>
  (await read()) ?? null;

/** True when it counted anything. */
const run = async (): Promise<boolean> => {
  const previous = await read();
  const isFresh = !!previous && Date.now() - previous.checkedAt < MAX_AGE_MS;
  const retryOnly =
    isFresh &&
    (previous.pending.tags.length ||
      previous.pending.genres.length ||
      previous.total === undefined);
  if (isFresh && !retryOnly) return false;

  const [tagNames, genres] = await Promise.all([
    getSteamTagNamesById(),
    HydraApi.get<string[]>(
      "/catalogue/steam/genres",
      { language: "en" },
      { needsAuth: false }
    ).catch(() => [] as string[]),
  ]);

  const counts: FacetCounts = {
    checkedAt: isFresh ? previous.checkedAt : Date.now(),
    tags: { ...previous?.tags },
    genres: { ...previous?.genres },
    total: (await countGames({})) ?? previous?.total,
    pending: { tags: [], genres: [] },
  };

  const tasks: (() => Promise<void>)[] = [];
  const tagIds = retryOnly ? previous.pending.tags : [...tagNames.keys()];
  const genreNames = retryOnly ? previous.pending.genres : genres;

  for (const id of tagIds) {
    tasks.push(async () => {
      const count = await countGames({ tags: [Number(id)] });
      // A failed request keeps yesterday's count.
      if (count === null) counts.pending.tags.push(id);
      else counts.tags[id] = count;
    });
  }
  for (const name of genreNames) {
    tasks.push(async () => {
      const count = await countGames({ genres: [name] });
      if (count === null) counts.pending.genres.push(name);
      else counts.genres[name] = count;
    });
  }

  const worker = async () => {
    for (let task = tasks.shift(); task; task = tasks.shift()) await task();
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  await catalogueFacetCountsSublevel.put(KEY, counts);
  logger.log(
    `[FacetCounts] Counted ${tagIds.length} tags and ${genreNames.length} genres, ${counts.pending.tags.length + counts.pending.genres.length} failed`
  );
  return true;
};

/**
 * Counts the games per tag and genre with one search each (about 500
 * requests, four at a time), at most once a day; values whose request failed
 * are asked for again the next time. Says so when a run finishes.
 */
export const refreshFacetCounts = (): Promise<void> => {
  running ??= run()
    .then((counted) => {
      if (counted) WindowManager.sendToAppWindows(UPDATED_EVENT);
    })
    .catch((error) => logger.warn("[FacetCounts] Run failed", error))
    .finally(() => {
      running = null;
    });
  return running;
};
