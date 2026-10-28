export type LocalSourceState = "ready" | "failed";

/** How Hydra's own copy of a download source is doing. */
export interface LocalSourceStatus {
  sourceId: string;
  state: LocalSourceState;
  entries: number;
  /** When the copy was last downloaded successfully. */
  fetchedAt: string | null;
  /** Why the last download failed, when it did. */
  error: string | null;
  /** The host serves a browser challenge that can be passed in a window. */
  needsVerification?: boolean;
}

/** How Hydra's AnkerGames catalogue is doing. */
export interface AnkerGamesStatus {
  enabled: boolean;
  refreshing: boolean;
  games: number;
  /** When the sitemaps were last read successfully. */
  fetchedAt: string | null;
  error: string | null;
}

/** A game from AnkerGames' home page, found in the catalogue by its Steam app id. */
export interface AnkerGamesFeedGame {
  shop: "steam";
  objectId: string;
  title: string;
  libraryImageUrl: string;
  /** The release AnkerGames has, e.g. "V 1.0.23.3". */
  version: string | null;
}

/** AnkerGames' trending and latest rows, as of the last daily read. */
export interface AnkerGamesFeed {
  enabled: boolean;
  /** A read of the home page is running; the rows may be an older copy. */
  refreshing: boolean;
  /** When the home page was last read successfully. */
  fetchedAt: string | null;
  trending: AnkerGamesFeedGame[];
  latest: AnkerGamesFeedGame[];
}
