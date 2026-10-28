import type { Game, LibraryGame } from "@types";
import { isImportedEntry } from "./imported-games.js";
import { getLibraryGameMembers } from "./library-catalogue.js";

type WishlistOnlyGame = Pick<
  Game,
  | "wishlisted"
  | "addedToLibraryAt"
  | "executablePath"
  | "installedSizeInBytes"
  | "playTimeInMilliseconds"
  | "steamHistoryImported"
  | "steamWishlistImported"
  | "floppyImported"
> & { download?: unknown };

/**
 * A wishlisted game the user never added to the library: the record only
 * remembers the wish. Imports keep their own flags and stay listed.
 */
export const isWishlistOnly = (game: WishlistOnlyGame): boolean =>
  game.wishlisted === true &&
  !game.addedToLibraryAt &&
  !game.executablePath &&
  game.installedSizeInBytes == null &&
  (game.playTimeInMilliseconds ?? 0) === 0 &&
  !game.download &&
  !isImportedEntry(game);

/** A library row, or a grouped row whose copies are all only wished for. */
export const isWishlistOnlyEntry = (game: LibraryGame): boolean =>
  getLibraryGameMembers(game).every(isWishlistOnly);
