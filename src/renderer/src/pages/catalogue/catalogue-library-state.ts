export type CatalogueLibraryState = "installed" | "owned" | "wishlisted";

export interface CatalogueLibraryGame {
  shop: string;
  objectId: string;
  catalogueGame?: { shop: string; objectId: string } | null;
}

export const catalogueKey = (game: { shop: string; objectId: string }) =>
  `${game.shop}:${game.objectId}`;

const STATE_RANK: Record<CatalogueLibraryState, number> = {
  installed: 2,
  owned: 1,
  wishlisted: 0,
};

/** In your library: installed or owned, not only wished for. */
export const isOwnedLibraryState = (
  state: CatalogueLibraryState | undefined
): state is "installed" | "owned" => state === "installed" || state === "owned";

/**
 * Library state per catalogue key. A copy counts for its own key and for the
 * catalogue game it is linked to; installed wins over owned, owned over a
 * wishlist-only entry.
 */
export const getCatalogueLibraryStates = <T extends CatalogueLibraryGame>(
  library: T[],
  isInstalled: (game: T) => boolean,
  isWishlistOnly: (game: T) => boolean = () => false
): Map<string, CatalogueLibraryState> => {
  const states = new Map<string, CatalogueLibraryState>();

  for (const game of library) {
    const state: CatalogueLibraryState = isInstalled(game)
      ? "installed"
      : isWishlistOnly(game)
        ? "wishlisted"
        : "owned";
    const keys = [catalogueKey(game)];
    if (game.catalogueGame) keys.push(catalogueKey(game.catalogueGame));

    for (const key of keys) {
      const current = states.get(key);
      if (!current || STATE_RANK[state] > STATE_RANK[current])
        states.set(key, state);
    }
  }

  return states;
};

export const CATALOGUE_HIDE_OWNED_STORAGE_KEY = "catalogue-hide-owned";
