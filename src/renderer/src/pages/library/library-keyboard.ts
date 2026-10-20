const normalize = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/**
 * The first title starting with what was typed, looking from `from` onwards
 * and wrapping around, so typing the same letter again moves to the next one.
 */
export const findTypeAheadMatch = (
  titles: readonly string[],
  typed: string,
  from: number
): number => {
  const query = normalize(typed);
  if (!query || titles.length === 0) return -1;

  for (let offset = 0; offset < titles.length; offset++) {
    const index = (from + offset) % titles.length;
    if (normalize(titles[index]).startsWith(query)) return index;
  }
  return -1;
};

export type LibraryArrowKey =
  | "ArrowLeft"
  | "ArrowRight"
  | "ArrowUp"
  | "ArrowDown"
  | "Home"
  | "End";

/** The card index an arrow key moves to in a grid of `columns`. */
export const moveFocus = (
  index: number,
  key: LibraryArrowKey,
  columns: number,
  count: number
): number => {
  if (count === 0) return -1;
  if (index < 0) return 0;

  const next = (() => {
    switch (key) {
      case "ArrowLeft":
        return index - 1;
      case "ArrowRight":
        return index + 1;
      case "ArrowUp":
        return index - columns;
      case "ArrowDown":
        return index + columns;
      case "Home":
        return 0;
      case "End":
        return count - 1;
    }
  })();

  return Math.min(count - 1, Math.max(0, next));
};
