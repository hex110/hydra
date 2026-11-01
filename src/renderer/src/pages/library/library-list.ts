import type { SortOption } from "./filter-options";

export type LibraryLayout = "covers" | "list";
export const LIBRARY_LAYOUT_STORAGE_KEY = "library-layout";
export const LIBRARY_LIST_ROW_HEIGHT = 48;

export const readStoredLayout = (stored: string | null): LibraryLayout =>
  stored === "list" ? "list" : "covers";

export type LibraryListColumn =
  | "playtime"
  | "last_played"
  | "added"
  | "status"
  | "rating"
  | "size";

/** The sort each column header picks; Title toggles A-Z and Z-A. */
export const LIBRARY_LIST_COLUMN_SORT: Record<LibraryListColumn, SortOption> = {
  playtime: "most_played",
  last_played: "recently_played",
  added: "recently_added",
  status: "play_status",
  rating: "rating",
  size: "installed_size",
};

/** Columns in order of importance; narrow windows drop them from the end. */
const COLUMNS_BY_IMPORTANCE: LibraryListColumn[] = [
  "playtime",
  "last_played",
  "status",
  "rating",
  "size",
  "added",
];
const DISPLAY_ORDER: LibraryListColumn[] = [
  "playtime",
  "last_played",
  "added",
  "status",
  "rating",
  "size",
];
const TITLE_MIN_WIDTH = 260;
const COLUMN_WIDTH = 120;

export const getLibraryListColumns = (width: number): LibraryListColumn[] => {
  const fits = Math.max(
    0,
    Math.floor((width - TITLE_MIN_WIDTH) / COLUMN_WIDTH)
  );
  const shown = new Set(COLUMNS_BY_IMPORTANCE.slice(0, fits));
  return DISPLAY_ORDER.filter((column) => shown.has(column));
};

export const getLibraryListTemplate = (columns: LibraryListColumn[]) =>
  [`minmax(${TITLE_MIN_WIDTH - 20}px, 1fr)`]
    .concat(columns.map(() => `${COLUMN_WIDTH}px`))
    .join(" ");
