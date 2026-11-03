import { useEffect, useState } from "react";
import type { FacetCounts, LibraryFacets } from "@shared";
import { logger } from "@renderer/logger";

let counts: FacetCounts | null = null;
let library: LibraryFacets | null = null;
let started = false;
const listeners = new Set<() => void>();

const notify = () => {
  for (const listener of listeners) listener();
};

const loadCounts = () =>
  window.electron
    .getCatalogueFacetCounts()
    .then((next) => {
      counts = next;
      notify();
    })
    .catch((error) => logger.error("Failed to load facet counts", error));

const start = () => {
  if (started) return;
  started = true;

  void loadCounts();
  window.electron
    .getLibraryFacets()
    .then((next) => {
      library = next;
      notify();
    })
    .catch((error) => logger.error("Failed to load library facets", error));
  // The main process counts in the background and says when it is done.
  window.electron.onCatalogueFacetCountsUpdated(() => void loadCounts());
};

/**
 * How many games the catalogue has per tag and genre (null until the first
 * count finishes, which takes a minute and happens once a day), and what the
 * library suggests as filters.
 */
export function useFacetCounts() {
  const [, setVersion] = useState(0);

  useEffect(() => {
    const listener = () => setVersion((value) => value + 1);
    listeners.add(listener);
    start();
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return { counts, library };
}
