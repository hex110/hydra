import type { GameLibraryMetadata } from "@types";

import { db } from "../level";
import { levelKeys } from "./keys";

/** Keyed by the catalogue game (`shop:objectId`). */
export const gameLibraryMetadataSublevel = db.sublevel<
  string,
  GameLibraryMetadata
>(levelKeys.gameLibraryMetadata, {
  valueEncoding: "json",
});
