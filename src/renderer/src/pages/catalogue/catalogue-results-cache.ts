export const CATALOGUE_PAGE_SIZE = 30;
export const CATALOGUE_VIEW_STORAGE_KEY = "catalogue-view";

export type CatalogueView = "list" | "grid";

export interface CatalogueResultsSnapshot<T> {
  key: string;
  results: T[];
  itemsCount: number;
  pagesLoaded: number;
  scrollTop: number;
}

/** One key per search: the same filters, mode and sources give the same list. */
export const getCatalogueQueryKey = (
  filters: object,
  mode: string,
  downloadSourceIds: string[]
) => JSON.stringify([mode, filters, [...downloadSourceIds].sort()]);

/** Appends a loaded page, skipping games an earlier page already returned. */
export const appendCatalogueResults = <T extends { id: string }>(
  current: T[],
  next: T[]
): T[] => {
  const seen = new Set(current.map((game) => game.id));
  return [...current, ...next.filter((game) => !seen.has(game.id))];
};

let snapshot: CatalogueResultsSnapshot<unknown> | null = null;

/**
 * The loaded list and scroll position, kept while Hydra runs, so going back
 * from a game page lands where you were.
 */
export const catalogueResultsCache = {
  get<T>(key: string): CatalogueResultsSnapshot<T> | null {
    return snapshot?.key === key
      ? (snapshot as CatalogueResultsSnapshot<T>)
      : null;
  },
  set<T>(next: CatalogueResultsSnapshot<T>) {
    snapshot = next;
  },
  setScrollTop(key: string, scrollTop: number) {
    if (snapshot?.key === key) snapshot = { ...snapshot, scrollTop };
  },
  clear() {
    snapshot = null;
  },
};
