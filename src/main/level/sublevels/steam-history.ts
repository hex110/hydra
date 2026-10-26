import type { SteamGameHistory } from "@types";

import { db } from "../level";
import { levelKeys } from "./keys";

/** Keyed by Steam app id. */
export const steamHistorySublevel = db.sublevel<string, SteamGameHistory>(
  levelKeys.steamHistory,
  { valueEncoding: "json" }
);
