import type {
  StoreItem,
  SteamChartsApp,
  SteamChartsTopRow,
  TuneSettings,
  FacetCounts,
} from "@shared";

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

/** steamcharts.com pages, keyed by `top:<page>` and `app:<id>`. */
export const steamChartsCacheSublevel = db.sublevel<
  string,
  { at: number; data: SteamChartsTopRow[] | SteamChartsApp }
>(levelKeys.steamChartsCache, { valueEncoding: "json" });

/** When the public build of a game last changed (unix ms), keyed by app id; null when Steam has no build for it. */
export const steamBuildDatesSublevel = db.sublevel<
  string,
  { at: number; builtAt: number | null }
>(levelKeys.steamBuildDates, { valueEncoding: "json" });

/** The recommender's Tune settings and presets, in one record under `settings`. */
export const catalogueTasteSublevel = db.sublevel<string, TuneSettings>(
  levelKeys.catalogueTaste,
  { valueEncoding: "json" }
);

/** Games the person does not want suggested, keyed by `shop:objectId`. */
export const catalogueNotInterestedSublevel = db.sublevel<
  string,
  { at: number; title: string }
>(levelKeys.catalogueNotInterested, { valueEncoding: "json" });

/** How many games the catalogue has per tag and genre, in one record under `counts`. */
export const catalogueFacetCountsSublevel = db.sublevel<string, FacetCounts>(
  levelKeys.catalogueFacetCounts,
  { valueEncoding: "json" }
);

/** Metacritic per Steam app id; `score` is null for a game Metacritic has not rated. */
export const criticScoresSublevel = db.sublevel<
  string,
  { at: number; score: number | null }
>(levelKeys.criticScores, { valueEncoding: "json" });

/** What each catalogue surface showed last, keyed by surface, so it can show it again at once. */
export const catalogueSnapshotsSublevel = db.sublevel<
  string,
  { at: number; data: unknown }
>(levelKeys.catalogueSnapshots, { valueEncoding: "json" });

/** How often a suggested game was shown without being opened, keyed by Steam app id. */
export const catalogueImpressionsSublevel = db.sublevel<
  string,
  { count: number; lastAt: number }
>(levelKeys.catalogueImpressions, { valueEncoding: "json" });
