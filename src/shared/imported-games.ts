import type { Game, LibraryImportSource } from "@types";

const FLAG_BY_SOURCE = {
  "steam-history": "steamHistoryImported",
  "steam-wishlist": "steamWishlistImported",
  floppy: "floppyImported",
} as const satisfies Record<LibraryImportSource, keyof Game>;

type ImportFlags = Pick<
  Game,
  "steamHistoryImported" | "steamWishlistImported" | "floppyImported"
>;

/** Patch that turns an imported entry into an ordinary library game. */
export const IMPORT_FLAGS_CLEARED: Required<ImportFlags> = {
  steamHistoryImported: false,
  steamWishlistImported: false,
  floppyImported: false,
};

export const isImportedEntry = (game: ImportFlags) =>
  game.steamHistoryImported === true ||
  game.steamWishlistImported === true ||
  game.floppyImported === true;

/**
 * An entry the import created and the user has not made their own: removing
 * it loses nothing. Downloading or launching a game clears its import flag.
 */
export const isUntouchedImport = (game: Game, source: LibraryImportSource) =>
  game[FLAG_BY_SOURCE[source]] === true &&
  !game.isDeleted &&
  !game.remoteId &&
  !game.executablePath &&
  !game.favorite &&
  !game.isPinned &&
  !game.notes &&
  !game.collectionIds?.length &&
  !game.customCoverImageUrl &&
  !game.customIconUrl &&
  !game.customHeroImageUrl &&
  !game.customLogoImageUrl &&
  (game.playTimeInMilliseconds ?? 0) === 0;
