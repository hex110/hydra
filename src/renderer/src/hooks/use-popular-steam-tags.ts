import { useEffect, useMemo, useState } from "react";
import type { SteamTag } from "@types";
import { logger } from "@renderer/logger";
import { useFacetCounts } from "@renderer/pages/catalogue/use-facet-counts";

export interface PopularSteamTags {
  /** Every Steam tag, most popular first. */
  tags: SteamTag[];
  /** Tags the catalogue has no games for (known once the counts are in). */
  empty: ReadonlySet<number>;
}

const noTags: SteamTag[] = [];
let loading: Promise<SteamTag[]> | null = null;

/** Steam's tags by popularity, minus those the catalogue has no games for. */
export function usePopularSteamTags(): PopularSteamTags {
  const [tags, setTags] = useState(noTags);
  const { counts } = useFacetCounts();

  useEffect(() => {
    let current = true;

    loading ??= window.electron
      .getSteamPopularTags()
      .then((list) => {
        if (list.length === 0) throw new Error("Steam listed no popular tags");
        return list;
      })
      .catch((error) => {
        logger.error("Failed to load popular Steam tags", error);
        loading = null;
        return noTags;
      });
    loading.then((result) => {
      if (current) setTags(result);
    });

    return () => {
      current = false;
    };
  }, []);

  const empty = useMemo(
    () =>
      new Set(
        Object.entries(counts?.tags ?? {})
          .filter(([, count]) => count === 0)
          .map(([id]) => Number(id))
      ),
    [counts]
  );

  return { tags, empty };
}
