import { useEffect, useState } from "react";
import { getSteamTagNames, invertSteamTags } from "@shared";
import { logger } from "@renderer/logger";

let namesById: Promise<Map<string, string>> | null = null;
const tagsByGame = new Map<string, Promise<string[]>>();

const loadTagNames = () => {
  namesById ??= window.electron.hydraApi
    .get<Record<string, number>>("/catalogue/steam/tags", {
      params: { language: "en" },
      needsAuth: false,
    })
    .then(invertSteamTags)
    .catch((error) => {
      logger.error("Failed to load Steam tag names", error);
      namesById = null;
      return new Map<string, string>();
    });

  return namesById;
};

const loadGameTags = (shop: string, objectId: string) => {
  const key = `${shop}:${objectId}`;
  let tags = tagsByGame.get(key);

  if (!tags) {
    tags = Promise.all([
      window.electron.hydraApi.get<{ tags?: (string | number)[] } | null>(
        `/games/${shop}/${encodeURIComponent(objectId)}`,
        { needsAuth: false }
      ),
      loadTagNames(),
    ])
      .then(([record, names]) => getSteamTagNames(record?.tags, names))
      .catch(() => {
        tagsByGame.delete(key);
        return [];
      });
    tagsByGame.set(key, tags);
  }

  return tags;
};

/**
 * The game's most voted Steam tags (English, to match the library's genre
 * filter), or an empty list while loading and for games without any.
 */
export function useSteamTags(shop: string, objectId: string): string[] {
  const [loaded, setLoaded] = useState<{ key: string; tags: string[] }>();
  const key = `${shop}:${objectId}`;

  useEffect(() => {
    if (!objectId) return;
    let cancelled = false;

    loadGameTags(shop, objectId).then((tags) => {
      if (!cancelled) setLoaded({ key, tags });
    });

    return () => {
      cancelled = true;
    };
  }, [shop, objectId, key]);

  return loaded?.key === key ? loaded.tags : [];
}
