import {
  filterLibraryGames,
  type LibraryCategory,
  type LibraryFilterGame,
} from "./library-category.js";
import {
  applyLibraryFilters,
  countActiveLibraryFilters,
  EMPTY_LIBRARY_FILTERS,
  filterLibraryGamesByTab,
  type LibraryFilterableGame,
  type LibraryFilters,
  type LibraryTab,
} from "./library-filters.js";

/** What the library page shows; the sidebar list follows it too. */
export interface LibraryView {
  tab: LibraryTab;
  filters: LibraryFilters;
  installedOnly: boolean;
  /** Consoles, on the All and Classics tabs. */
  platforms: string[];
}

export const DEFAULT_LIBRARY_VIEW: LibraryView = {
  tab: "all",
  filters: EMPTY_LIBRARY_FILTERS,
  installedOnly: false,
  platforms: [],
};

export const tabShowsPlatforms = (tab: LibraryTab) =>
  tab === "all" || tab === "classics";

/** The category filter that matches a tab; the tab filter narrows it further. */
export const getTabCategory = (tab: LibraryTab): LibraryCategory => {
  if (tab === "all") return "all";
  return tab === "classics" ? "classics" : "pc";
};

type ViewGame = LibraryFilterableGame & LibraryFilterGame;

export const applyLibraryView = <T extends ViewGame>(
  games: T[],
  view: LibraryView,
  isInstalled: (game: T) => boolean
): T[] => {
  let filtered = filterLibraryGames(games, {
    category: getTabCategory(view.tab),
    sources: [],
    platforms: tabShowsPlatforms(view.tab) ? view.platforms : [],
  });
  filtered = filterLibraryGamesByTab(filtered, view.tab);
  filtered = applyLibraryFilters(filtered, view.filters);
  return view.installedOnly ? filtered.filter(isInstalled) : filtered;
};

/** Everything that narrows the view: the tab, filters, installed and consoles. */
export const countLibraryViewFilters = (view: LibraryView) =>
  (view.tab === "all" ? 0 : 1) +
  countActiveLibraryFilters(view.filters) +
  (view.installedOnly ? 1 : 0) +
  (tabShowsPlatforms(view.tab) ? view.platforms.length : 0);
