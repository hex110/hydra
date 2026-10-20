import {
  getGameGenres,
  libraryTabIncludes,
  type LibraryFilterableGame,
} from "./library-filters.js";

export type LibraryGroupBy =
  | "none"
  | "play_status"
  | "genre"
  | "source"
  | "installed";

export const LIBRARY_GROUP_BY_OPTIONS: readonly LibraryGroupBy[] = [
  "none",
  "play_status",
  "genre",
  "source",
  "installed",
];

export const LIBRARY_GROUP_BY_STORAGE_KEY = "library-group-by";
export const LIBRARY_COLLAPSED_GROUPS_STORAGE_KEY = "library-collapsed-groups";

export interface LibraryGroup<T> {
  /** Stable id: `<groupBy>:<value>`; the value is shown as is for genres. */
  id: string;
  value: string;
  games: T[];
}

const PLAY_STATUS_ORDER = ["playing", "backlog", "finished", "dropped", "none"];
const SOURCE_ORDER = ["local", "steam", "epic", "classics"] as const;

/** Group values in display order; a game can be in several (genres, sources). */
const groupValues = <T extends LibraryFilterableGame>(
  game: T,
  groupBy: LibraryGroupBy,
  isInstalled: (game: T) => boolean
): string[] => {
  switch (groupBy) {
    case "play_status":
      return [game.playStatus ?? "none"];
    case "genre": {
      const genres = getGameGenres(game);
      return genres.length > 0 ? genres : [""];
    }
    case "source": {
      const sources = SOURCE_ORDER.filter((source) =>
        libraryTabIncludes(game, source)
      );
      return sources.length > 0 ? sources : ["local"];
    }
    case "installed":
      return [isInstalled(game) ? "installed" : "not_installed"];
    case "none":
    default:
      return ["all"];
  }
};

const compareValues = (groupBy: LibraryGroupBy, a: string, b: string) => {
  const order =
    groupBy === "play_status"
      ? PLAY_STATUS_ORDER
      : groupBy === "source"
        ? (SOURCE_ORDER as readonly string[])
        : groupBy === "installed"
          ? ["installed", "not_installed"]
          : null;
  if (order) return order.indexOf(a) - order.indexOf(b);
  // Genres alphabetically, games without one last.
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
};

/** Splits the (already sorted) list into groups, keeping the order within each. */
export const groupLibrary = <T extends LibraryFilterableGame>(
  games: T[],
  groupBy: LibraryGroupBy,
  isInstalled: (game: T) => boolean
): LibraryGroup<T>[] => {
  if (groupBy === "none") return [{ id: "none:all", value: "all", games }];

  const groups = new Map<string, T[]>();
  for (const game of games) {
    for (const value of groupValues(game, groupBy, isInstalled)) {
      const list = groups.get(value) ?? [];
      list.push(game);
      groups.set(value, list);
    }
  }

  return [...groups.entries()]
    .sort(([a], [b]) => compareValues(groupBy, a, b))
    .map(([value, list]) => ({
      id: `${groupBy}:${value}`,
      value,
      games: list,
    }));
};
