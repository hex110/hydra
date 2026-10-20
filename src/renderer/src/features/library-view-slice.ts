import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import {
  DEFAULT_LIBRARY_VIEW,
  type LibraryView,
} from "@renderer/pages/library/library-view";

export interface LibraryViewState {
  value: LibraryView;
}

const initialState: LibraryViewState = { value: DEFAULT_LIBRARY_VIEW };

export const libraryViewSlice = createSlice({
  name: "libraryView",
  initialState,
  reducers: {
    setLibraryView: (state, action: PayloadAction<LibraryView>) => {
      state.value = action.payload;
    },
  },
});

export const { setLibraryView } = libraryViewSlice.actions;
