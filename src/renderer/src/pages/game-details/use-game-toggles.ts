import { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { applyLibraryGroupAction } from "@shared";
import { gameDetailsContext } from "@renderer/context";
import { useLibrary, useToast, useUserDetails } from "@renderer/hooks";

/** Favourite, pin and wishlist for the game on the page (all copies of it). */
export function useGameToggles() {
  const { t } = useTranslation("game_details");
  const { game, presentation, updateGame } = useContext(gameDetailsContext);
  const { updateLibrary } = useLibrary();
  const { showSuccessToast, showErrorToast } = useToast();
  const { userDetails } = useUserDetails();
  const [busy, setBusy] = useState(false);

  const members = presentation?.members ?? (game ? [game] : []);
  const favorite = Boolean(presentation?.favorite ?? game?.favorite);
  const pinned = Boolean(presentation?.isPinned ?? game?.isPinned);
  const wishlisted = members.some((member) => member.wishlisted);
  const canPin = Boolean(userDetails) && game?.shop !== "custom";

  const run = async (
    action: () => Promise<unknown>,
    successKey: string | null,
    failureKey: string,
    ns?: string
  ) => {
    if (!game) return;
    setBusy(true);

    try {
      await action();
      if (successKey) showSuccessToast(t(successKey));
    } catch {
      showErrorToast(t(failureKey, { ns }));
    } finally {
      await Promise.all([updateLibrary(), updateGame()]);
      setBusy(false);
    }
  };

  const toggleFavorite = () =>
    run(
      () =>
        applyLibraryGroupAction(members, (member) =>
          favorite
            ? window.electron.removeGameFromFavorites(
                member.shop,
                member.objectId
              )
            : window.electron.addGameToFavorites(member.shop, member.objectId)
        ),
      favorite ? "game_removed_from_favorites" : "game_added_to_favorites",
      "failed_update_favorites"
    );

  const togglePinned = () =>
    run(
      () =>
        applyLibraryGroupAction(members, (member) =>
          window.electron.toggleGamePin(member.shop, member.objectId, !pinned)
        ),
      pinned ? "game_removed_from_pinned" : "game_added_to_pinned",
      "failed_update_pinned"
    );

  const toggleWishlisted = () =>
    run(
      () =>
        applyLibraryGroupAction(members, (member) =>
          window.electron.setGameWishlisted(
            member.shop,
            member.objectId,
            !wishlisted
          )
        ),
      null,
      "failed_update_wishlist",
      "library"
    );

  return {
    favorite,
    pinned,
    wishlisted,
    canPin,
    busy,
    toggleFavorite,
    togglePinned,
    toggleWishlisted,
  };
}
