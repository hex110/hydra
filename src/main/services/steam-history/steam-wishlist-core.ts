import type { SteamWishlistEntry, SteamWishlistEvent } from "@types";

/** The parts of Steam's store item that matter here. */
export interface SteamStoreItem {
  appid?: number;
  success?: number;
  visible?: boolean;
  name?: string;
  is_coming_soon?: boolean;
  is_early_access?: boolean;
  release?: {
    steam_release_date?: number;
    is_coming_soon?: boolean;
    is_early_access?: boolean;
  };
}

const DAY_SECONDS = 86_400;

/** A delisted or unknown app comes back empty; that is not a release. */
export const isUsableStoreItem = (item: SteamStoreItem) =>
  item.success === 1 && item.visible !== false && Boolean(item.name);

export const toWishlistEntry = (
  item: SteamStoreItem,
  appId: string,
  dateAdded: number,
  now: number
): SteamWishlistEntry => ({
  appId,
  name: item.name ?? appId,
  dateAdded,
  comingSoon:
    item.is_coming_soon === true || item.release?.is_coming_soon === true,
  releaseDate: item.release?.steam_release_date ?? null,
  isEarlyAccess:
    item.is_early_access === true || item.release?.is_early_access === true,
  checkedAt: now,
});

/**
 * What changed for a wishlisted game since the last check. The first sight of
 * a game is a baseline, never an event, so connecting does not announce every
 * game that is already out.
 */
export const wishlistEvent = (
  previous: SteamWishlistEntry | null,
  next: SteamWishlistEntry,
  nowSeconds: number
): SteamWishlistEvent | null => {
  if (!previous?.comingSoon) return null;

  if (!next.comingSoon) {
    const released =
      next.releaseDate !== null && next.releaseDate <= nowSeconds + DAY_SECONDS;
    return released ? "released" : null;
  }

  if (previous.releaseDate === null && next.releaseDate !== null) {
    return "date-announced";
  }

  return null;
};

/** Upcoming games that Hydra should list, newest wishlisted first. */
export const upcomingEntries = (entries: SteamWishlistEntry[]) =>
  entries
    .filter((entry) => entry.comingSoon)
    .sort((a, b) => b.dateAdded - a.dateAdded);
