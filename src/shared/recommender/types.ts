import type { SteamTagWeight } from "../similar-games.js";

export type TuneBasis = "all-time" | "recent" | "picked";
/** How many of a game's first tags an avoided tag may be among. */
export type TuneStrictness = 5 | 10 | 20;
/** How far down a game's tags a "leans toward" tag may be. */
export type TuneDepth = 3 | 5 | 10;
/** How long the main story is: under 5 hours, 5–15, 15–40, over 40. */
export type TuneLength = "short" | "medium" | "long" | "epic";
export type TuneProtonMinimum = "any" | "silver" | "gold" | "platinum";

export interface TuneYears {
  gte?: number;
  lte?: number;
}

/** Everything the Tune panel sets. */
export interface TuneOptions {
  basedOn: TuneBasis;
  /** Library keys (`shop:objectId`) used when `basedOn` is `picked`. */
  pickedGames: string[];
  /** Library keys the person removed from Based on. */
  excludedSeeds: string[];
  /** Count the playtime of idle games at 10 %. */
  idleDiscount: boolean;
  avoidTags: number[];
  /** Avoiding a tag also avoids the tags that mean nearly the same. */
  avoidRelated: boolean;
  avoidStrictness: TuneStrictness;
  leanTags: number[];
  leanDepth: TuneDepth;
  /** −1 niche … 1 popular. */
  popularity: number;
  /** −1 older … 1 newer. */
  recency: number;
  minReviewPercent: number;
  minReviews: number;
  maxReviews: number | null;
  years: TuneYears | null;
  length: TuneLength | null;
  finishedOnly: boolean;
  singleplayerOnly: boolean;
  hideEarlyAccess: boolean;
  protonMinimum: TuneProtonMinimum;
  downloadableOnly: boolean;
}

export const DEFAULT_TUNE_OPTIONS: TuneOptions = {
  basedOn: "all-time",
  pickedGames: [],
  excludedSeeds: [],
  idleDiscount: true,
  avoidTags: [],
  avoidRelated: true,
  avoidStrictness: 5,
  leanTags: [],
  leanDepth: 5,
  popularity: 0,
  recency: 0,
  minReviewPercent: 70,
  minReviews: 50,
  maxReviews: null,
  years: null,
  length: null,
  finishedOnly: false,
  singleplayerOnly: false,
  hideEarlyAccess: false,
  protonMinimum: "any",
  downloadableOnly: false,
};

/** The avoid list is shared by every surface, so presets leave it out. */
export type TunePresetOptions = Omit<
  TuneOptions,
  "avoidTags" | "avoidRelated" | "avoidStrictness"
>;

export interface TunePreset {
  id: string;
  name: string;
  options: TunePresetOptions;
}

export interface NotInterestedGame {
  shop: string;
  objectId: string;
  title: string;
  at: number;
}

export interface TuneSettings {
  options: TuneOptions;
  presets: TunePreset[];
}

export const DEFAULT_TUNE_SETTINGS: TuneSettings = {
  options: DEFAULT_TUNE_OPTIONS,
  presets: [],
};

/** A library game as the recommender sees it, one per Steam app. */
export interface SeedInput {
  /** `steam:<appId>`. */
  key: string;
  appId: string;
  title: string;
  hours: number;
  /** Played in the last 90 days. */
  recentHours: number;
  rating: number | null;
  status: "playing" | "finished" | "dropped" | "backlog" | null;
  wishlisted: boolean;
  tags: SteamTagWeight[];
}

export type SeedNote =
  | "idle"
  | "rated-high"
  | "rated-low"
  | "finished"
  | "dropped"
  | "intent"
  | "capped";

export interface ProfileSeed {
  key: string;
  appId: string;
  title: string;
  /** Signed weight after the cap. */
  weight: number;
  /** This game's share of all the weight, 0–1 (absolute). */
  share: number;
  hours: number;
  notes: SeedNote[];
}

export interface ProfileFamily {
  /** The family's most weighty tag, to name it. */
  tagId: number;
  /** Share of the taste vector, 0–1. */
  share: number;
  /** The game that adds most to it. */
  seedTitle: string | null;
  seedHours: number;
}

/** What the recommender learned from the library, shown in Tune. */
export interface TasteProfile {
  seeds: ProfileSeed[];
  tags: { tagId: number; share: number }[];
  dominantFamily: ProfileFamily | null;
  /** How many library games had anything to learn from. */
  seedCount: number;
}

/** A store game the recommender may suggest. */
export interface PoolCandidate {
  appId: string;
  title: string;
  tags: SteamTagWeight[];
  reviewCount: number | null;
  reviewPercent: number | null;
  reviewLabel: string | null;
  releaseDate: number | null;
  isEarlyAccess: boolean;
  type: number;
  playerCategories: number[];
  developers: string[];
  publishers: string[];
  headerImageUrl: string | null;
  /** Library keys of the seeds whose "More like this" list holds it, with its place in each (0–1, best 1). */
  behaviour: { seedKey: string; place: number }[];
}

export interface Recommendation {
  appId: string;
  title: string;
  headerImageUrl: string | null;
  score: number;
  tagIds: number[];
  reviewPercent: number | null;
  reviewCount: number | null;
  reviewLabel: string | null;
  releaseYear: number | null;
  /** The played game that contributed most. */
  becauseOf: { key: string; appId: string; title: string } | null;
  /** The tags that contributed most to the match. */
  matchTagIds: number[];
}

export interface BecauseShelf {
  seed: { key: string; appId: string; title: string };
  results: Recommendation[];
}

export interface RecommendationResponse {
  profile: TasteProfile;
  results: Recommendation[];
  /** For the top seeds: their own "More like this" lists, re-ranked. */
  because: BecauseShelf[];
  /** Games dropped by a filter that could not be applied to them. */
  leftOut: {
    buildDateUnknown: number;
    tierUnknown: number;
    lengthUnknown: number;
  };
  /** Set when the library or Steam could not be read. */
  failed: boolean;
}
