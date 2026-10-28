import { useEffect, useState } from "react";
import type { GameShop } from "@types";

const tagsByGame = new Map<string, Promise<string[]>>();

const loadGameTags = (shop: GameShop, objectId: string) => {
  const key = `${shop}:${objectId}`;
  let tags = tagsByGame.get(key);

  if (!tags) {
    tags = window.electron.getGameSteamTags(shop, objectId).catch(() => {
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
export function useSteamTags(shop: GameShop, objectId: string): string[] {
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
