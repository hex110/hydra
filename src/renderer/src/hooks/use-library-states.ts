import { useMemo } from "react";

import { isGameReadyToPlay } from "@renderer/helpers";
import {
  catalogueKey,
  getCatalogueLibraryStates,
} from "@renderer/pages/catalogue/catalogue-library-state";

import { useLibrary } from "./use-library";

/**
 * Each store game's place in your library (installed, or just owned), for
 * `GameLibraryBadge`. Look a game up with `stateOf`.
 */
export function useLibraryStates() {
  const { library } = useLibrary();
  const states = useMemo(
    () => getCatalogueLibraryStates(library, isGameReadyToPlay),
    [library]
  );
  const stateOf = (game: { shop: string; objectId: string }) =>
    states.get(catalogueKey(game));
  return { states, stateOf };
}
