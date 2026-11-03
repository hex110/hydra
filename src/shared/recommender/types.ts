import type { SteamTagWeight } from "../similar-games.js";
import { IDLE_TAG_IDS } from "../store-games.js";

/**
 * What the suggestions start from: the library in taste groups, chosen games
 * (from the library or the catalogue), or chosen tags alone.
 */
export type TuneBasis = "groups" | "games" | "tags";
/** Mix all groups, or the id of one. */
export type TuneGroup = "all" | string;
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
  /** Which group For you shows in Groups; `all` mixes them. */
  group: TuneGroup;
  /** Steam keys (`steam:<appId>`) used when `basedOn` is `games`; need not be owned. */
  pickedGames: string[];
  /** Tags used when `basedOn` is `tags`. */
  seedTags: number[];
  /** Library keys the person removed from Based on. */
  excludedSeeds: string[];
  /** Multiplayer-led games leave every group's taste, and suggestions must be singleplayer. */
  leaveOutMultiplayer: boolean;
  /** Per taste group, by id. */
  groupSettings: Record<string, GroupSettings>;
  /** Groups the person made, by refining one or building around games. */
  customGroups: CustomGroup[];
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
  basedOn: "groups",
  group: "all",
  pickedGames: [],
  seedTags: [],
  excludedSeeds: [],
  leaveOutMultiplayer: false,
  groupSettings: {},
  customGroups: [],
  // Idle games run in the background; their playtime is not taste.
  avoidTags: [...IDLE_TAG_IDS],
  avoidRelated: true,
  avoidStrictness: 5,
  leanTags: [],
  leanDepth: 5,
  popularity: 0,
  // Old games gathered their reviews over years; lean toward what's current.
  recency: 0.6,
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

/** A Browse search saved under a name: its filters and sort. */
export interface BrowsePreset {
  id: string;
  name: string;
  filters: Record<string, unknown>;
}

/** Settings from before groups: version 1 had `idleDiscount` and other `basedOn` names. */
export const TUNE_SETTINGS_VERSION = 3;

export interface GroupSettings {
  hidden?: boolean;
  leaveOutMultiplayer?: boolean;
}

/** A group the person kept: its games, by library key. */
export interface CustomGroup {
  id: string;
  gameKeys: string[];
  /** The tags that named it when it was made, until its games say otherwise. */
  tagIds: number[];
}

export interface TuneSettings {
  version?: number;
  options: TuneOptions;
  presets: TunePreset[];
  browsePresets: BrowsePreset[];
  /** Games played outside Hydra, by Steam app id, with the rating given. */
  playedElsewhere?: Record<string, PlayedElsewhere>;
}

export interface PlayedElsewhere {
  title: string;
  /** Hydra's 1–10, or null when not rated. */
  rating: number | null;
  at: number;
}

export const DEFAULT_TUNE_SETTINGS: TuneSettings = {
  options: DEFAULT_TUNE_OPTIONS,
  presets: [],
  browsePresets: [],
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
  /** Not in the library: picked from the catalogue, or logged as played elsewhere. */
  elsewhere?: boolean;
}

export type SeedNote =
  | "rated-high"
  | "rated-low"
  | "finished"
  | "dropped"
  | "intent"
  | "capped"
  /** Not in the library: chosen in Games mode or logged as played elsewhere. */
  | "elsewhere";

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

/** One game in a taste group. */
export interface GroupGame extends ProfileSeed {
  /** Share of the group's weight, 0–1. */
  groupShare: number;
}

/** A group of games with a taste in common, named by its three most telling tags. */
export interface ProfileGroup {
  /** Stable while the library is much the same: from the group's anchor tags. */
  id: string;
  /** The tags that name the group and that a suggestion must carry one of. */
  tagIds: number[];
  /** Every game in the group, heaviest first. */
  games: GroupGame[];
  hours: number;
  /** Share of all the weight, 0–1. */
  share: number;
  /** Made by the person. */
  isCustom?: boolean;
  /** Hidden from Mix all and Discover. */
  isHidden?: boolean;
}

/** A group Hydra offers when refining a group or building one around games. */
export interface GroupProposal {
  tagIds: number[];
  gameKeys: string[];
  /** The games that show it best, heaviest first. */
  examples: { key: string; title: string; hours: number }[];
  gameCount: number;
  /** For Build around: how wide it reaches. */
  size?: "tight" | "medium" | "broad";
}

/** What the recommender learned from the library, shown in Tune. */
export interface TasteProfile {
  seeds: ProfileSeed[];
  tags: { tagId: number; share: number }[];
  dominantFamily: ProfileFamily | null;
  groups: ProfileGroup[];
  /** Library games played or rated that Steam has no tags for, so they can't be used. */
  untaggedCount: number;
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
  /** Metacritic, part of the Hydra rating. */
  criticScore?: number | null;
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
  criticScore: number | null;
  releaseYear: number | null;
  /** The taste group it was found for. */
  groupId: string | null;
  /** The played game that contributed most. */
  becauseOf: { key: string; appId: string; title: string } | null;
  /** The tags that contributed most to the match. */
  matchTagIds: number[];
}

export interface RecommendationResponse {
  profile: TasteProfile;
  results: Recommendation[];
  /** The group shown, or `all`. */
  group: TuneGroup;
  /** Games dropped by a filter that could not be applied to them. */
  leftOut: {
    buildDateUnknown: number;
    tierUnknown: number;
    lengthUnknown: number;
  };
  /** Downloadable only is on but no download source is set up. */
  noDownloadSources: boolean;
  /** Set when the library or Steam could not be read. */
  failed: boolean;
}
