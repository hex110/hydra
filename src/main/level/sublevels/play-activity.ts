import type { PlayActivityDay } from "@types";

import { db } from "../level";
import { levelKeys } from "./keys";

/** Keyed by local date (`YYYY-MM-DD`). */
export const playActivitySublevel = db.sublevel<string, PlayActivityDay>(
  levelKeys.playActivity,
  { valueEncoding: "json" }
);
