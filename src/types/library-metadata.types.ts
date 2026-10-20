export type PlayStatus = "playing" | "finished" | "dropped" | "backlog";

export interface HowLongToBeatHours {
  mainStory: number | null;
  mainExtra: number | null;
  completionist: number | null;
}

/** Catalogue data the library filters and sorts by, cached per catalogue game. */
export interface GameLibraryMetadata {
  genres: string[];
  /** ISO date. */
  releaseDate: string | null;
  /** Metacritic score, 0–100. */
  criticScore: number | null;
  /** Average Hydra review score, 0–5. */
  userScore: number | null;
  protonDbTier: string | null;
  howLongToBeat: HowLongToBeatHours | null;
  fetchedAt: number;
}

/** User edits to a game's details; undefined leaves a field as it is, null clears it. */
export interface GameMetadataOverrides {
  customDescription?: string | null;
  customGenres?: string[] | null;
  metadataLanguage?: string | null;
}
