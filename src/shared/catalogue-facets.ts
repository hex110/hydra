/** Games in the catalogue per tag (by Steam id) and genre (by English name). */
export interface FacetCounts {
  checkedAt: number;
  tags: Record<string, number>;
  genres: Record<string, number>;
  /** Games in the whole catalogue; missing in counts stored before it was kept. */
  total?: number;
  /** Values whose last request failed; the next run asks for these again. */
  pending: { tags: string[]; genres: string[] };
}

/** What the person's own library suggests as filters. */
export interface LibraryFacets {
  /** The tags with the most playtime behind them, strongest first. */
  tagIds: number[];
  /** Developers and publishers of the most played games, most played first. */
  developers: string[];
  publishers: string[];
}

/** Software and media categories that are not games, left out of the Genres filter. */
export const NON_GAME_STEAM_GENRES: ReadonlySet<string> = new Set([
  "Accounting",
  "Animation & Modeling",
  "Audio Production",
  "Design & Illustration",
  "Education",
  "Photo Editing",
  "Software Training",
  "Utilities",
  "Video Production",
  "Web Publishing",
  "Game Development",
  "Documentary",
  "Tutorial",
]);

export interface FacetItem {
  value: string | number;
  label: string;
}

export interface OrderedFacetItem extends FacetItem {
  count: number | null;
  group: "selected" | "library" | "rest";
}

/**
 * Orders a filter's values: the selected ones first, then the ones from the
 * person's library, then everything else by count, highest first (values with
 * no count yet after those, in the order given). A value known to have no games is left
 * out unless it is selected.
 */
export const orderFacetItems = (
  items: readonly FacetItem[],
  counts: ReadonlyMap<string | number, number> | null,
  selected: ReadonlySet<string | number>,
  fromLibrary: readonly (string | number)[] = []
): OrderedFacetItem[] => {
  const libraryRank = new Map(
    fromLibrary.map((value, index) => [value, index])
  );

  const ordered = items
    .filter((item) => selected.has(item.value) || counts?.get(item.value) !== 0)
    .map((item): OrderedFacetItem => {
      const group = selected.has(item.value)
        ? "selected"
        : libraryRank.has(item.value)
          ? "library"
          : "rest";
      return { ...item, count: counts?.get(item.value) ?? null, group };
    });

  const rank = { selected: 0, library: 1, rest: 2 } as const;
  return ordered.sort((a, b) => {
    if (a.group !== b.group) return rank[a.group] - rank[b.group];
    if (a.group === "library") {
      return (libraryRank.get(a.value) ?? 0) - (libraryRank.get(b.value) ?? 0);
    }
    // Values with no count yet keep the order they came in.
    if (a.count === null && b.count === null) return 0;
    if (a.count === null) return 1;
    if (b.count === null) return -1;
    return b.count - a.count || a.label.localeCompare(b.label);
  });
};
