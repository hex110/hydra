import { useEffect, useState } from "react";
import type { SteamTag } from "@types";
import { logger } from "@renderer/logger";

/** How many of the most popular tags are checked for having games. */
export const VERIFIED_POPULAR_TAGS = 45;

const CHECK_CONCURRENCY = 6;
const CHECK_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const STORAGE_KEY = "catalogue-empty-tags";

export interface PopularSteamTags {
  /** Every Steam tag, most popular first. */
  tags: SteamTag[];
  /** Popular tags the catalogue has no games for. */
  empty: ReadonlySet<number>;
}

const none: PopularSteamTags = { tags: [], empty: new Set() };

let loading: Promise<PopularSteamTags> | null = null;

const countGames = async (tagId: number): Promise<number | null> => {
  try {
    const response = await window.electron.hydraApi.post<{ count: number }>(
      "/catalogue/search",
      {
        data: {
          title: "",
          sortBy: "popularity",
          sortOrder: "desc",
          downloadSourceFingerprints: [],
          tags: [tagId],
          publishers: [],
          genres: [],
          developers: [],
          protondbSupportBadges: [],
          deckCompatibility: [],
          take: 5,
          skip: 0,
          downloadSourceIds: [],
        },
        needsAuth: false,
      }
    );
    return typeof response?.count === "number" ? response.count : null;
  } catch {
    return null;
  }
};

const readCachedEmpty = (checked: string): Set<number> | null => {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (
      stored?.checked === checked &&
      Date.now() - stored.checkedAt < CHECK_MAX_AGE_MS
    ) {
      return new Set<number>(stored.empty);
    }
  } catch {
    // Unreadable storage just means checking again.
  }
  return null;
};

const findEmptyTags = async (tags: SteamTag[]) => {
  const checked = tags.map((tag) => tag.id).join(",");
  const cachedEmpty = readCachedEmpty(checked);
  if (cachedEmpty) return cachedEmpty;

  const empty = new Set<number>();
  const queue = [...tags];
  let failed = false;

  const worker = async () => {
    for (let tag = queue.shift(); tag; tag = queue.shift()) {
      const count = await countGames(tag.id);
      if (count === 0) empty.add(tag.id);
      if (count === null) failed = true;
    }
  };
  await Promise.all(Array.from({ length: CHECK_CONCURRENCY }, worker));

  // A failed check is not remembered, so the next page load tries again.
  if (!failed) {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ checked, checkedAt: Date.now(), empty: [...empty] })
      );
    } catch {
      // Not persisted.
    }
  }

  return empty;
};

const load = async (): Promise<PopularSteamTags> => {
  const tags = await window.electron.getSteamPopularTags();
  if (tags.length === 0) throw new Error("Steam listed no popular tags");

  // The catalogue lists some very common tags (Roguelike, Roguelite) with no
  // games, which would sit at the top of a popularity-ordered list.
  const empty = await findEmptyTags(tags.slice(0, VERIFIED_POPULAR_TAGS));

  return { tags, empty };
};

/** Steam's tags by popularity, minus the popular ones the catalogue has no games for. */
export function usePopularSteamTags(): PopularSteamTags {
  const [popular, setPopular] = useState(none);

  useEffect(() => {
    let current = true;

    loading ??= load().catch((error) => {
      logger.error("Failed to load popular Steam tags", error);
      loading = null;
      return none;
    });
    loading.then((result) => {
      if (current) setPopular(result);
    });

    return () => {
      current = false;
    };
  }, []);

  return popular;
}
