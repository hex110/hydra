/** Smallest cover width per slider step; the last step shows wide cards. */
export const LIBRARY_COVER_WIDTHS = [96, 120, 150, 185, 230, 290] as const;
export const LIBRARY_CARD_SIZE_STEPS = LIBRARY_COVER_WIDTHS.length + 1;
export const LIBRARY_LARGE_CARD_STEP = LIBRARY_COVER_WIDTHS.length;
export const LIBRARY_CARD_SIZE_STORAGE_KEY = "library-card-size";
export const DEFAULT_LIBRARY_CARD_SIZE = 2;

export const isLargeCardStep = (step: number) =>
  step >= LIBRARY_LARGE_CARD_STEP;

export const clampCardSize = (step: number) =>
  Number.isFinite(step)
    ? Math.min(LIBRARY_CARD_SIZE_STEPS - 1, Math.max(0, Math.round(step)))
    : DEFAULT_LIBRARY_CARD_SIZE;

/** The old view buttons map onto the slider: compact, grid, large. */
export const readStoredCardSize = (
  storage: Pick<Storage, "getItem">
): number => {
  const stored = storage.getItem(LIBRARY_CARD_SIZE_STORAGE_KEY);
  if (stored !== null) return clampCardSize(Number(stored));

  switch (storage.getItem("library-view-mode")) {
    case "grid":
      return 3;
    case "large":
      return LIBRARY_LARGE_CARD_STEP;
    default:
      return DEFAULT_LIBRARY_CARD_SIZE;
  }
};

export const getLibraryColumns = (
  width: number,
  step: number,
  gap: number
): number => {
  if (isLargeCardStep(step)) return width >= 900 ? 2 : 1;
  const minWidth = LIBRARY_COVER_WIDTHS[clampCardSize(step)];
  return Math.max(1, Math.floor((width + gap) / (minWidth + gap)));
};
