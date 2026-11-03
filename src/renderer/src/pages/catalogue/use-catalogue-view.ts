import { useState } from "react";
import {
  CATALOGUE_VIEW_STORAGE_KEY,
  type CatalogueView,
} from "./catalogue-results-cache";

/** List or grid, remembered, and shared by every page of the catalogue that lists games. */
export function useCatalogueView() {
  const [view, setView] = useState<CatalogueView>(() => {
    try {
      return localStorage.getItem(CATALOGUE_VIEW_STORAGE_KEY) === "grid"
        ? "grid"
        : "list";
    } catch {
      return "list";
    }
  });

  const changeView = (next: CatalogueView) => {
    setView(next);
    try {
      localStorage.setItem(CATALOGUE_VIEW_STORAGE_KEY, next);
    } catch {
      /* not persisted */
    }
  };

  return [view, changeView] as const;
}
