import type { SteamWishlistEntry } from "@types";

import { db } from "../level";
import { levelKeys } from "./keys";

/** Keyed by Steam app id. */
export const steamWishlistSublevel = db.sublevel<string, SteamWishlistEntry>(
  levelKeys.steamWishlist,
  { valueEncoding: "json" }
);
