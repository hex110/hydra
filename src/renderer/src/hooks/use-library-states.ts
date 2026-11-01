import { useMemo } from "react";

import { isGameReadyToPlay } from "@renderer/helpers";
import { isWishlistOnly } from "@shared";
import {
  catalogueKey,
  getCatalogueLibraryStates,
} from "@renderer/pages/catalogue/catalogue-library-state";

import { useLibrary } from "./use-library";

/**
 * Each store game's place in your library (installed, owned, or only wishlisted), for
 * `GameLibraryBadge`. Look a game up with `stateOf`.
 */
export function useLibraryStates() {
  const { library } = useLibrary();
  const states = useMemo(
    () => getCatalogueLibraryStates(library, isGameReadyToPlay, isWishlistOnly),
    [library]
  );
  const stateOf = (game: { shop: string; objectId: string }) =>
    states.get(catalogueKey(game));
  return { states, stateOf };
}
