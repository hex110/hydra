import type { StoreItem } from "@shared";

import { db } from "../level";
import { levelKeys } from "./keys";

/** Steam's store page for a game, keyed by app id; `item` is null for an id Steam does not list. */
export const steamStoreItemsSublevel = db.sublevel<
  string,
  { at: number; item: StoreItem | null }
>(levelKeys.steamStoreItems, { valueEncoding: "json" });

/** The day's most played games as app ids by rank, keyed by `YYYY-MM-DD`. */
export const chartSnapshotsSublevel = db.sublevel<string, string[]>(
  levelKeys.chartSnapshots,
  { valueEncoding: "json" }
);

export interface SteamSpyGame {
  appId: string;
  name: string;
  /** Players in game at yesterday's peak. */
  ccu: number;
  positive: number;
  negative: number;
}

/** SteamSpy's lists, keyed by request (`tag:Singleplayer`, `top100in2weeks`). */
export const steamSpyCacheSublevel = db.sublevel<
  string,
  { at: number; games: SteamSpyGame[] }
>(levelKeys.steamSpyCache, { valueEncoding: "json" });
