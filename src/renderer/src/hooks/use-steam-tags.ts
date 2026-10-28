import { useEffect, useState } from "react";
import type { GameShop, SteamTag } from "@types";

const tagsByGame = new Map<string, Promise<SteamTag[]>>();

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
 * The game's most voted Steam tags (English names, with the ids the catalogue
 * filters by), or an empty list while loading and for games without any.
 */
export function useSteamTags(shop: GameShop, objectId: string): SteamTag[] {
  const [loaded, setLoaded] = useState<{ key: string; tags: SteamTag[] }>();
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
