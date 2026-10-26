/** One game on the user's Steam wishlist, as last seen. */
export interface SteamWishlistEntry {
  appId: string;
  name: string;
  /** Unix seconds when it was wishlisted. */
  dateAdded: number;
  comingSoon: boolean;
  /** Unix seconds; null while unannounced ("To be announced", "Coming soon"). */
  releaseDate: number | null;
  isEarlyAccess: boolean;
  /** Epoch milliseconds of the last check. */
  checkedAt: number;
}

export type SteamWishlistEvent = "released" | "date-announced";
