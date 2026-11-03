import type { CatalogueTab } from "@renderer/features";

const positions: Partial<Record<CatalogueTab, number>> = {};

/**
 * Where Discover and Charts were scrolled to, kept while Hydra runs. Browse
 * keeps its own with its results, in `catalogue-results-cache`.
 */
export const catalogueTabScroll = {
  get: (tab: CatalogueTab) => positions[tab] ?? 0,
  set: (tab: CatalogueTab, scrollTop: number) => {
    positions[tab] = scrollTop;
  },
};
