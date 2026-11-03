import {
  getStoreRating,
  STEAM_GAME_TYPE,
  type SteamSearchQuery,
} from "@shared";
import type { CatalogueSearchResult } from "@types";
import { searchSteamStore } from "@main/services/steam-store-search";
import { getStoreItems } from "@main/services/steam-store-items";
import { registerEvent } from "../register-event";

const MAX_FACTS = 200;

/**
 * One page of Steam's store search as catalogue results, for Browse when it
 * needs what only Steam's search can do. Sorted by reviews, each page is put
 * in Hydra rating order. Null when Steam could not be reached.
 */
registerEvent(
  "searchSteamStoreGames",
  async (
    _event,
    query: SteamSearchQuery
  ): Promise<{ count: number; edges: CatalogueSearchResult[] } | null> => {
    const page = await searchSteamStore(query ?? {});
    if (!page) return null;

    const items = await getStoreItems(page.appIds);
    const edges: (CatalogueSearchResult & { rating: number })[] = [];
    for (const appId of page.appIds) {
      const item = items.get(appId);
      if (!item || item.type !== STEAM_GAME_TYPE) continue;
      edges.push({
        id: `steam:${appId}`,
        objectId: appId,
        shop: "steam",
        title: item.title,
        genres: [],
        releaseYear: item.releaseDate
          ? new Date(item.releaseDate).getUTCFullYear()
          : null,
        developers: item.developers,
        publishers: item.publishers,
        libraryImageUrl: item.headerImageUrl,
        downloadSources: [],
        rating: getStoreRating(item)?.value ?? 0,
      });
    }

    if (query?.sortBy === "Reviews_DESC") {
      edges.sort((a, b) => b.rating - a.rating);
    }
    return {
      count: page.total,
      edges: edges.map(({ rating: _rating, ...edge }) => edge),
    };
  }
);

/** Tags and player categories of Steam games, for Browse's filters that Hydra's search can't apply. */
registerEvent(
  "getStoreFilterFacts",
  async (
    _event,
    appIds: string[]
  ): Promise<Record<string, { tags: number[]; players: number[] }>> => {
    const items = await getStoreItems(
      Array.isArray(appIds) ? appIds.slice(0, MAX_FACTS) : []
    );
    const facts: Record<string, { tags: number[]; players: number[] }> = {};
    for (const [appId, item] of items) {
      if (item) {
        facts[appId] = {
          tags: item.tags.map((tag) => tag.tagid),
          players: item.playerCategories,
        };
      }
    }
    return facts;
  }
);
