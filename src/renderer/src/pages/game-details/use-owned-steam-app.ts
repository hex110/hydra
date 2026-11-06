import { isValidSteamAppId } from "@shared";
import type { CatalogueGameIdentity } from "@types";

import { useSteamHistory } from "./your-game/use-steam-history";

/**
 * The Steam app id when the connected Steam account owns this game, so Steam
 * can install it. Ownership comes from the Steam history import, which lists
 * every owned game whether or not it is in the library; null while loading,
 * when the history is not connected, and for games Steam does not list.
 */
export function useOwnedSteamAppId(
  catalogueGame: CatalogueGameIdentity | null | undefined
) {
  const appId =
    catalogueGame?.shop === "steam" && isValidSteamAppId(catalogueGame.objectId)
      ? catalogueGame.objectId
      : null;

  return useSteamHistory(appId) ? appId : null;
}
