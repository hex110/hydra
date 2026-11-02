import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  CheckIcon,
  DownloadIcon,
  PlusIcon,
  StarFillIcon,
  StarIcon,
  XIcon,
} from "@primer/octicons-react";
import cn from "classnames";
import type { GameShop } from "@types";
import { buildGameDetailsPath } from "@renderer/helpers";
import { useLibrary } from "@renderer/hooks";
import { logger } from "@renderer/logger";
import {
  isOwnedLibraryState,
  type CatalogueLibraryState,
} from "@renderer/pages/catalogue/catalogue-library-state";
import "./store-game-actions.scss";

export interface StoreGameIdentity {
  shop: GameShop;
  objectId: string;
  title: string;
  platform?: string | null;
}

/** Adding to the library and the wishlist, for any store game. */
export function useStoreGameActions(
  game: StoreGameIdentity,
  libraryState: CatalogueLibraryState | undefined
) {
  const { updateLibrary } = useLibrary();
  const [isAdding, setIsAdding] = useState(false);
  const [isUpdatingWishlist, setIsUpdatingWishlist] = useState(false);

  const added = isOwnedLibraryState(libraryState);
  const wishlisted = libraryState === "wishlisted";

  const addToLibrary = async () => {
    if (added || isAdding) return;

    setIsAdding(true);
    try {
      await window.electron.addGameToLibrary(
        game.shop,
        game.objectId,
        game.title,
        game.platform ?? null
      );
      updateLibrary();
    } catch (error) {
      logger.error("Failed to add game to library", error);
    } finally {
      setIsAdding(false);
    }
  };

  const toggleWishlist = async () => {
    if (added || isUpdatingWishlist) return;

    setIsUpdatingWishlist(true);
    try {
      await window.electron.setGameWishlisted(
        game.shop,
        game.objectId,
        !wishlisted,
        game.title,
        game.platform ?? null
      );
      updateLibrary();
    } catch (error) {
      logger.error("Failed to update the wishlist", error);
    } finally {
      setIsUpdatingWishlist(false);
    }
  };

  return {
    added,
    wishlisted,
    isAdding,
    isUpdatingWishlist,
    addToLibrary,
    toggleWishlist,
  };
}

export interface StoreGameActionsProps {
  game: StoreGameIdentity;
  libraryState?: CatalogueLibraryState;
  /** A download option exists, from a source or AnkerGames. */
  canDownload?: boolean;
  onNotInterested?: () => void;
}

/**
 * Add, wishlist, download and not interested, over a store game's cover.
 * Hidden until the card is hovered or has keyboard focus inside it.
 */
export function StoreGameActions({
  game,
  libraryState,
  canDownload = false,
  onNotInterested,
}: Readonly<StoreGameActionsProps>) {
  const { t } = useTranslation("game_details");
  const navigate = useNavigate();
  const {
    added,
    wishlisted,
    isAdding,
    isUpdatingWishlist,
    addToLibrary,
    toggleWishlist,
  } = useStoreGameActions(game, libraryState);

  const wishlistLabel = t(
    wishlisted ? "remove_from_wishlist" : "add_to_wishlist",
    { ns: "library" }
  );

  return (
    <div className="store-game-actions">
      {onNotInterested && (
        <button
          type="button"
          className="store-game-actions__button"
          onClick={onNotInterested}
          title={t("not_interested", { ns: "catalogue" })}
          aria-label={t("not_interested", { ns: "catalogue" })}
        >
          <XIcon size={16} />
        </button>
      )}
      {canDownload && (
        <button
          type="button"
          className="store-game-actions__button"
          onClick={() =>
            navigate(buildGameDetailsPath(game), {
              state: { openRepacks: true },
            })
          }
          title={t("download_game", { ns: "catalogue" })}
          aria-label={t("download_game", { ns: "catalogue" })}
        >
          <DownloadIcon size={16} />
        </button>
      )}
      {!added && (
        <button
          type="button"
          className={cn("store-game-actions__button", {
            "store-game-actions__button--active": wishlisted,
          })}
          onClick={toggleWishlist}
          title={wishlistLabel}
          aria-label={wishlistLabel}
          aria-pressed={wishlisted}
          disabled={isUpdatingWishlist}
        >
          {wishlisted ? <StarFillIcon size={16} /> : <StarIcon size={16} />}
        </button>
      )}
      <button
        type="button"
        className={cn("store-game-actions__button", {
          "store-game-actions__button--added": added,
        })}
        onClick={addToLibrary}
        title={added ? t("already_in_library") : t("add_to_library")}
        aria-label={added ? t("already_in_library") : t("add_to_library")}
        disabled={added || isAdding}
      >
        {added ? <CheckIcon size={16} /> : <PlusIcon size={16} />}
      </button>
    </div>
  );
}
