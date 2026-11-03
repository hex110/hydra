import { useCallback, useEffect, useMemo, useState } from "react";
import { expandTagFamilies } from "@shared";
import { logger } from "@renderer/logger";

import { useTuneSettings } from "./use-tune-settings";

const known = new Map<string, number[]>();

interface Game {
  shop: string;
  objectId: string;
}

/**
 * Drops games with an avoided tag among their first few. Shelves that do not
 * come from the recommender have no tags, so they are asked for; a game whose
 * tags are not known yet stays until they are.
 */
export function useAvoidFilter(games: Game[]) {
  const { options } = useTuneSettings();
  const [, setVersion] = useState(0);

  const avoided = useMemo(
    () =>
      new Set(
        options.avoidRelated
          ? expandTagFamilies(options.avoidTags)
          : options.avoidTags
      ),
    [options.avoidRelated, options.avoidTags]
  );

  const wanted = games
    .filter((game) => game.shop === "steam")
    .map((game) => game.objectId)
    .filter((id) => !known.has(id));
  const wantedKey = avoided.size > 0 ? wanted.join("|") : "";

  useEffect(() => {
    if (!wantedKey) return;

    let current = true;
    window.electron
      .getStoreTagIds(wantedKey.split("|"))
      .then((tags) => {
        for (const id of wantedKey.split("|")) known.set(id, tags[id] ?? []);
        if (current) setVersion((value) => value + 1);
      })
      .catch((error) => logger.error("Failed to load store tags", error));

    return () => {
      current = false;
    };
  }, [wantedKey]);

  const isAvoided = useCallback(
    (tagIds: number[]) =>
      avoided.size > 0 &&
      tagIds.slice(0, options.avoidStrictness).some((id) => avoided.has(id)),
    [avoided, options.avoidStrictness]
  );

  const filter = useCallback(
    <T extends Game>(list: T[]): T[] => {
      if (avoided.size === 0) return list;

      return list.filter((game) => {
        const tags = game.shop === "steam" ? known.get(game.objectId) : null;
        return !tags || !isAvoided(tags);
      });
    },
    // `known` grows as tags arrive; the version bump rebuilds this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [avoided, isAvoided, wantedKey, wanted.length]
  );

  return { filter, isAvoided };
}
