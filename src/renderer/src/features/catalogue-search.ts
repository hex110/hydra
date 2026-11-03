import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";

import { isEqual, omit } from "lodash-es";

import type { CatalogueSearchPayload } from "@types";

export type CatalogueMode = "modern" | "classics";
export type CatalogueTab = "discover" | "charts" | "browse";
/** Discover shows its shelves, or opens a shelf as a page of its own. */
export type DiscoverView = "shelves" | "for-you";

export interface CatalogueSearchState {
  filters: CatalogueSearchPayload;
  page: number;
  steamUserTags: Record<string, Record<string, number>>;
  steamGenres: Record<string, string[]>;
  mode: CatalogueMode;
  tab: CatalogueTab;
  discoverView: DiscoverView;
}

const initialState: CatalogueSearchState = {
  filters: {
    title: "",
    sortBy: "popularity",
    sortOrder: "desc",
    downloadSourceFingerprints: [],
    tags: [],
    publishers: [],
    genres: [],
    developers: [],
    protondbSupportBadges: [],
    deckCompatibility: [],
    platforms: [],
  },
  steamUserTags: {},
  steamGenres: {},
  page: 1,
  mode: "modern",
  tab: "discover",
  discoverView: "shelves",
};

const SORT_KEYS = ["sortBy", "sortOrder"] as const;

/** A search, a tag or a year: anything but the order is a request to see results. */
const narrowsTheCatalogue = (filters: CatalogueSearchPayload) =>
  !isEqual(omit(filters, SORT_KEYS), omit(initialState.filters, SORT_KEYS));

export const catalogueSearchSlice = createSlice({
  name: "catalogueSearch",
  initialState,
  reducers: {
    setFilters: (
      state,
      action: PayloadAction<Partial<CatalogueSearchPayload>>
    ) => {
      state.filters = { ...state.filters, ...action.payload };
      state.page = initialState.page;
      if (narrowsTheCatalogue(state.filters)) state.tab = "browse";
    },
    setCatalogueTab: (state, action: PayloadAction<CatalogueTab>) => {
      state.tab = action.payload;
    },
    setDiscoverView: (state, action: PayloadAction<DiscoverView>) => {
      state.discoverView = action.payload;
      if (action.payload === "for-you") state.tab = "discover";
    },
    clearFilters: (state) => {
      state.filters = initialState.filters;
      state.page = initialState.page;
    },
    setPage: (state, action: PayloadAction<number>) => {
      state.page = action.payload;
    },
    clearPage: (state) => {
      state.page = initialState.page;
    },
    setTags: (
      state,
      action: PayloadAction<Record<string, Record<string, number>>>
    ) => {
      state.steamUserTags = action.payload;
    },
    setGenres: (state, action: PayloadAction<Record<string, string[]>>) => {
      state.steamGenres = action.payload;
    },
    setMode: (state, action: PayloadAction<CatalogueMode>) => {
      state.mode = action.payload;
      state.page = initialState.page;
      if (action.payload === "classics") state.tab = "browse";
      state.filters = {
        ...state.filters,
        tags: [],
        genres: [],
        developers: [],
        publishers: [],
        downloadSourceFingerprints: [],
        protondbSupportBadges: [],
        deckCompatibility: [],
        releaseYear: undefined,
        platforms: [],
      };
    },
  },
});

export const {
  setFilters,
  clearFilters,
  setPage,
  clearPage,
  setTags,
  setGenres,
  setMode,
  setCatalogueTab,
  setDiscoverView,
} = catalogueSearchSlice.actions;
