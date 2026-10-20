import type { LocalCollection } from "@types";

import { db } from "../level";
import { levelKeys } from "./keys";

/** Keyed by collection id (`local-…`). */
export const localCollectionsSublevel = db.sublevel<string, LocalCollection>(
  levelKeys.localCollections,
  { valueEncoding: "json" }
);
