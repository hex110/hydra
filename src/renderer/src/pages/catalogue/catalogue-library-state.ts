export type CatalogueLibraryState = "installed" | "owned";

export interface CatalogueLibraryGame {
  shop: string;
  objectId: string;
  catalogueGame?: { shop: string; objectId: string } | null;
}

export const catalogueKey = (game: { shop: string; objectId: string }) =>
  `${game.shop}:${game.objectId}`;

/**
 * Library state per catalogue key. A copy counts for its own key and for the
 * catalogue game it is linked to; an installed copy wins over an owned one.
 */
export const getCatalogueLibraryStates = <T extends CatalogueLibraryGame>(
  library: T[],
  isInstalled: (game: T) => boolean
): Map<string, CatalogueLibraryState> => {
  const states = new Map<string, CatalogueLibraryState>();

  for (const game of library) {
    const state: CatalogueLibraryState = isInstalled(game)
      ? "installed"
      : "owned";
    const keys = [catalogueKey(game)];
    if (game.catalogueGame) keys.push(catalogueKey(game.catalogueGame));

    for (const key of keys) {
      if (states.get(key) !== "installed") states.set(key, state);
    }
  }

  return states;
};

export const CATALOGUE_HIDE_OWNED_STORAGE_KEY = "catalogue-hide-owned";
