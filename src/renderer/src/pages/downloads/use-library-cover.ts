import { useCallback } from "react";

import { useLibrary } from "@renderer/hooks";
import type { GameShop } from "@types";

/** Cover lookup for rows about a game that may or may not be in the library. */
export function useLibraryCover() {
  const { library } = useLibrary();

  return useCallback(
    (shop: GameShop, objectId: string) => {
      const game = library.find(
        (item) => item.shop === shop && item.objectId === objectId
      );
      return game?.customCoverImageUrl || game?.libraryImageUrl || null;
    },
    [library]
  );
}
