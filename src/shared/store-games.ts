import type { SteamTagWeight } from "./similar-games.js";

/** Steam's item type for a game; demos, DLC and soundtracks have others. */
export const STEAM_GAME_TYPE = 0;

export const STEAM_TAG = {
  singleplayer: 4182,
  earlyAccess: 493,
  freeToPlay: 113,
} as const;

/** Steam's player categories. */
export const STEAM_PLAYER_CATEGORY = {
  singlePlayer: 2,
  mmo: 20,
} as const;

/** Tags that mean "played with other people", so a game led by one is not singleplayer. */
export const MULTIPLAYER_TAG_IDS = new Set([
  3859, // Multiplayer
  128, // Massively Multiplayer
  1754, // MMORPG
  1775, // PvP
  1685, // Co-op
  3843, // Online Co-Op
  7368, // Local Multiplayer
  3841, // Local Co-Op
  4508, // Co-op Campaign
  17770, // Asynchronous Multiplayer
]);

/**
 * Tags that mean nearly the same thing, so avoiding or leaning on one takes
 * the others with it. Ids come from Steam's tag list (`populartags`). Souls-like
 * has no near neighbours there, so it is not a family.
 */
export const IDLE_TAG_IDS: readonly number[] = [615955, 560542, 379975]; // Idler, Incremental, Clicker

export const TAG_FAMILIES: readonly (readonly number[])[] = [
  IDLE_TAG_IDS,
  [...MULTIPLAYER_TAG_IDS],
  [1716, 3959, 42804, 454187, 1091588], // Roguelike, Roguelite, Action, Traditional, Deckbuilder
  [1667, 1721, 3978], // Horror, Psychological Horror, Survival Horror
];

/**
 * Tags that describe the format of a game, not what it is like, so they say
 * nothing about taste: Singleplayer, Multiplayer, 2D, 3D, Early Access, Free
 * to Play, Controller, Great Soundtrack.
 */
export const FEATURE_TAG_IDS: ReadonlySet<number> = new Set([
  4182, 3859, 3871, 4191, 493, 113, 7481, 1756,
]);

/** The tags and every tag of the families they belong to. */
export const expandTagFamilies = (tagIds: number[]): number[] => {
  const expanded = new Set(tagIds);
  for (const family of TAG_FAMILIES) {
    if (family.some((id) => expanded.has(id))) {
      for (const id of family) expanded.add(id);
    }
  }
  return [...expanded];
};

/** What Hydra keeps of Steam's store page for a game. */
export interface StoreItem {
  appId: string;
  title: string;
  /** Steam's item type; 0 is a game. */
  type: number;
  /** Most voted first. */
  tags: SteamTagWeight[];
  reviewCount: number | null;
  reviewPercent: number | null;
  reviewLabel: string | null;
  /** Unix milliseconds. */
  releaseDate: number | null;
  /** When the game left Early Access (unix ms); missing in items cached before it was read. */
  leftEarlyAccessAt?: number | null;
  /** Not out yet; `releaseDate` is then Steam's announced date, as precise as `releasePrecision` says. */
  isComingSoon?: boolean;
  releasePrecision?: "day" | "month" | "quarter" | "year" | "unknown";
  isEarlyAccess: boolean;
  isFree: boolean;
  playerCategories: number[];
  developers: string[];
  publishers: string[];
  headerImageUrl: string | null;
}

interface RawStoreItem {
  success?: number;
  visible?: boolean;
  type?: number;
  appid?: number;
  name?: string;
  is_free?: boolean;
  tags?: SteamTagWeight[];
  categories?: { supported_player_categoryids?: number[] };
  reviews?: {
    summary_filtered?: {
      review_count?: number;
      percent_positive?: number;
      review_score_label?: string;
    };
  };
  basic_info?: {
    developers?: { name?: string }[];
    publishers?: { name?: string }[];
  };
  assets?: Record<string, string>;
  release?: {
    steam_release_date?: number;
    release_from_early_access_date?: number;
    is_coming_soon?: boolean;
    coming_soon_display?: string;
  };
}

const RELEASE_PRECISION: Record<
  string,
  NonNullable<StoreItem["releasePrecision"]>
> = {
  date_full: "day",
  date_month: "month",
  date_quarter: "quarter",
  date_year: "year",
};

const ASSETS_URL = "https://shared.steamstatic.com/store_item_assets/";
/** Early Access shows among a game's first tags; further down it is a rumour. */
const EARLY_ACCESS_TAG_DEPTH = 10;

const names = (list: { name?: string }[] | undefined) =>
  (list ?? []).flatMap((entry) => (entry.name ? [entry.name] : []));

/** One `IStoreBrowseService/GetItems` entry as a {@link StoreItem}; null for a game Steam does not list. */
export const parseStoreItem = (raw: RawStoreItem): StoreItem | null => {
  if (!raw.appid || !raw.name) return null;
  if (raw.success !== undefined && raw.success !== 1) return null;

  const tags = [...(raw.tags ?? [])].sort((a, b) => b.weight - a.weight);
  const summary = raw.reviews?.summary_filtered;
  const reviewCount =
    summary?.review_count && summary.review_count > 0
      ? summary.review_count
      : null;
  const format = raw.assets?.asset_url_format;
  const header = raw.assets?.header;
  const release = raw.release?.steam_release_date;

  return {
    appId: String(raw.appid),
    title: raw.name,
    type: raw.type ?? STEAM_GAME_TYPE,
    tags,
    reviewCount,
    reviewPercent: reviewCount ? (summary?.percent_positive ?? null) : null,
    reviewLabel: reviewCount ? (summary?.review_score_label ?? null) : null,
    releaseDate: release && release > 0 ? release * 1000 : null,
    leftEarlyAccessAt:
      raw.release?.release_from_early_access_date &&
      raw.release.release_from_early_access_date > 0
        ? raw.release.release_from_early_access_date * 1000
        : null,
    isComingSoon: raw.release?.is_coming_soon === true,
    releasePrecision: raw.release?.is_coming_soon
      ? (RELEASE_PRECISION[raw.release.coming_soon_display ?? ""] ?? "unknown")
      : "day",
    isEarlyAccess: tags
      .slice(0, EARLY_ACCESS_TAG_DEPTH)
      .some((tag) => tag.tagid === STEAM_TAG.earlyAccess),
    isFree: raw.is_free === true,
    playerCategories: raw.categories?.supported_player_categoryids ?? [],
    developers: names(raw.basic_info?.developers),
    publishers: names(raw.basic_info?.publishers),
    headerImageUrl:
      format && header
        ? `${ASSETS_URL}${format.replace("${FILENAME}", header)}`
        : `${ASSETS_URL}steam/apps/${raw.appid}/header.jpg`,
  };
};

/**
 * A game you play alone: Steam lists it as a game with single-player and not
 * as an MMO, and Singleplayer is among its tags, ahead of every multiplayer
 * tag. (Rainbow Six Siege and Helldivers 2 carry the Singleplayer tag, low
 * in their lists; Baldur's Gate 3 lists it above Co-op.)
 */
export const isSingleplayerGame = (
  item: Pick<StoreItem, "type" | "playerCategories" | "tags">
) => {
  if (item.type !== STEAM_GAME_TYPE) return false;
  if (!item.playerCategories.includes(STEAM_PLAYER_CATEGORY.singlePlayer))
    return false;
  if (item.playerCategories.includes(STEAM_PLAYER_CATEGORY.mmo)) return false;

  const singleplayerAt = item.tags.findIndex(
    (tag) => tag.tagid === STEAM_TAG.singleplayer
  );
  if (singleplayerAt === -1) return false;

  return !item.tags
    .slice(0, singleplayerAt)
    .some((tag) => MULTIPLAYER_TAG_IDS.has(tag.tagid));
};

/**
 * Played mostly with others, judged from tags alone (a library game's
 * player categories aren't kept): a multiplayer tag ranks above
 * Singleplayer, or there is no Singleplayer tag but a multiplayer one.
 */
export const isMultiplayerLed = (tags: readonly SteamTagWeight[]) => {
  const singleplayerAt = tags.findIndex(
    (tag) => tag.tagid === STEAM_TAG.singleplayer
  );
  const multiplayerAt = tags.findIndex((tag) =>
    MULTIPLAYER_TAG_IDS.has(tag.tagid)
  );
  if (multiplayerAt === -1) return false;
  return singleplayerAt === -1 || multiplayerAt < singleplayerAt;
};

const MONTH_MS = 30.44 * 24 * 60 * 60 * 1000;

/**
 * Released at least `months` ago, not Early Access, and the public build not
 * updated for `months`. Null when the build date is unknown: that is shown as
 * unknown, never as finished. DLC releases are not counted.
 */
export const isFinishedGame = (
  item: Pick<StoreItem, "releaseDate" | "isEarlyAccess">,
  lastBuildUpdate: number | null,
  now: number,
  months = 12
): boolean | null => {
  if (lastBuildUpdate === null) return null;
  if (item.isEarlyAccess || item.releaseDate === null) return false;

  const window = months * MONTH_MS;
  return now - item.releaseDate >= window && now - lastBuildUpdate >= window;
};
