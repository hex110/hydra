import type { SaveSyncStatus } from "@types";

import { db } from "../level";
import { levelKeys } from "./keys";

/** The last automatic save sync of each game, by game key. */
export const saveSyncStatusSublevel = db.sublevel<string, SaveSyncStatus>(
  levelKeys.saveSyncStatus,
  { valueEncoding: "json" }
);
