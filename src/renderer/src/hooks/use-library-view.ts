import { useCallback } from "react";
import { setLibraryView } from "@renderer/features";
import {
  LIBRARY_INSTALLED_ONLY_STORAGE_KEY,
  LIBRARY_PLATFORMS_STORAGE_KEY,
  LIBRARY_SOURCES_STORAGE_KEY,
} from "@renderer/session-state-keys";
import {
  LIBRARY_FILTERS_STORAGE_KEY,
  LIBRARY_TAB_STORAGE_KEY,
  parseStoredLibraryFilters,
  readStoredLibraryTab,
} from "@renderer/pages/library/library-filters";
import {
  tabShowsPlatforms,
  type LibraryView,
} from "@renderer/pages/library/library-view";
import { useAppDispatch, useAppSelector } from "./redux";

const readStoredPlatforms = (): string[] => {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(LIBRARY_PLATFORMS_STORAGE_KEY) ?? "[]"
    );
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
};

/** Read once at startup, after the previous session's state is cleared. */
export const readStoredLibraryView = (): LibraryView => ({
  tab: readStoredLibraryTab(
    localStorage,
    "library-category",
    LIBRARY_SOURCES_STORAGE_KEY
  ),
  filters: parseStoredLibraryFilters(
    localStorage.getItem(LIBRARY_FILTERS_STORAGE_KEY)
  ),
  installedOnly:
    localStorage.getItem(LIBRARY_INSTALLED_ONLY_STORAGE_KEY) === "true",
  platforms: readStoredPlatforms(),
});

const persist = (view: LibraryView) => {
  try {
    localStorage.setItem(LIBRARY_TAB_STORAGE_KEY, view.tab);
    localStorage.setItem(
      LIBRARY_FILTERS_STORAGE_KEY,
      JSON.stringify(view.filters)
    );
    localStorage.setItem(
      LIBRARY_INSTALLED_ONLY_STORAGE_KEY,
      String(view.installedOnly)
    );
    localStorage.setItem(
      LIBRARY_PLATFORMS_STORAGE_KEY,
      JSON.stringify(view.platforms)
    );
  } catch {
    // Storage can be unavailable; the view still applies for this session.
  }
};

/** The library's tab, filters, installed toggle and consoles, shared with the sidebar. */
export function useLibraryView() {
  const dispatch = useAppDispatch();
  const view = useAppSelector((state) => state.libraryView.value);

  const updateView = useCallback(
    (patch: Partial<LibraryView>) => {
      const next = { ...view, ...patch };
      if (!tabShowsPlatforms(next.tab)) next.platforms = [];
      persist(next);
      dispatch(setLibraryView(next));
    },
    [dispatch, view]
  );

  return { view, updateView };
}
