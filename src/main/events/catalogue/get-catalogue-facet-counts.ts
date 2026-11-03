import {
  getFacetCounts,
  refreshFacetCounts,
} from "@main/services/catalogue-facet-counts";
import { getLibraryFacets } from "@main/services/recommender";
import { registerEvent } from "../register-event";

registerEvent("getCatalogueFacetCounts", async () => {
  const counts = await getFacetCounts();
  // Not awaited: the page shows what there is and hears when the run is done.
  void refreshFacetCounts();
  return counts;
});

registerEvent("getLibraryFacets", () => getLibraryFacets());
