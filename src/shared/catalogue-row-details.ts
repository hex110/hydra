import { sourceMatchKey } from "./local-source-matching.js";

/** Extra data shown on a store game, fetched once it is on screen. */
export interface StoreGameFacts {
  criticScore: number | null;
  /** How Long to Beat's main story time, in hours. */
  howLongToBeatHours: number | null;
  /**
   * The median download size among the sources, in bytes. The smallest
   * upload is often a patch or fix rather than the game.
   */
  downloadSize: number | null;
  /** Screenshot thumbnails for hover previews. */
  screenshots: string[];
  /** Steam tag ids, most voted first. */
  tagIds: number[];
  /** Steam's share of positive reviews (summary_filtered.percent_positive). */
  reviewPercent: number | null;
  /** Number of Steam reviews (summary_filtered.review_count). */
  reviewCount: number | null;
  /** From the search result when it has one, else Steam's release date. */
  releaseYear: number | null;
}

export const CATALOGUE_PREVIEW_SCREENSHOTS = 5;
/** Tags kept per game; the card shows as many as fit. */
export const CATALOGUE_ROW_TAGS = 4;

interface StoreGameFactsInput {
  steamDetails?: {
    metacritic?: { score?: number } | null;
    screenshots?: { path_thumbnail?: string; path_full?: string }[];
  } | null;
  howLongToBeatHours?: number | null;
  downloadSizes?: (number | null)[];
  tagIds?: (string | number)[];
  reviews?: { percentPositive?: number; count?: number } | null;
  /** Unix seconds, from Steam's store item. */
  steamReleaseDate?: number | null;
  releaseYear?: number | null;
}

const yearOf = (unixSeconds: number | null | undefined) =>
  typeof unixSeconds === "number" && unixSeconds > 0
    ? new Date(unixSeconds * 1000).getUTCFullYear()
    : null;

export const buildStoreGameFacts = ({
  steamDetails,
  howLongToBeatHours,
  downloadSizes,
  tagIds,
  reviews,
  steamReleaseDate,
  releaseYear,
}: StoreGameFactsInput): StoreGameFacts => {
  const sizes = (downloadSizes ?? [])
    .filter((size): size is number => typeof size === "number" && size > 0)
    .sort((a, b) => a - b);
  const score = steamDetails?.metacritic?.score;
  const reviewCount = reviews?.count;
  const hasReviews = typeof reviewCount === "number" && reviewCount > 0;

  return {
    criticScore: typeof score === "number" && score > 0 ? score : null,
    howLongToBeatHours: howLongToBeatHours ?? null,
    downloadSize:
      sizes.length > 0 ? sizes[Math.floor((sizes.length - 1) / 2)] : null,
    screenshots: (steamDetails?.screenshots ?? [])
      .map((shot) => shot.path_thumbnail ?? shot.path_full)
      .filter((url): url is string => Boolean(url))
      .slice(0, CATALOGUE_PREVIEW_SCREENSHOTS),
    tagIds: (tagIds ?? []).map(Number).slice(0, CATALOGUE_ROW_TAGS),
    reviewPercent:
      hasReviews && typeof reviews?.percentPositive === "number"
        ? reviews.percentPositive
        : null,
    reviewCount: hasReviews ? reviewCount : null,
    releaseYear: releaseYear ?? yearOf(steamReleaseDate),
  };
};

/**
 * Sizes of the downloads named after the game. Sources match loosely
 * (Grand Theft Auto V also returns every Vice City release), so the rest
 * would skew the size.
 */
export const getMatchingDownloadSizes = (
  gameTitle: string,
  downloads: { title: string; size: number | null }[]
): (number | null)[] => {
  const key = sourceMatchKey(gameTitle);
  if (!key) return [];
  return downloads
    .filter((download) => sourceMatchKey(download.title) === key)
    .map((download) => download.size);
};

/** Metacritic's colour bands. */
export const getCriticScoreTone = (score: number) =>
  score >= 75 ? "good" : score >= 50 ? "mixed" : "bad";

/** Fewer reviews than this and Steam shows no score. */
export const MIN_REVIEWS_FOR_TONE = 10;

/** Steam's colour bands for the share of positive reviews. */
export const getReviewTone = (
  percent: number | null | undefined,
  count: number | null | undefined
): "positive" | "mixed" | "negative" | null => {
  if (
    typeof percent !== "number" ||
    typeof count !== "number" ||
    count < MIN_REVIEWS_FOR_TONE
  )
    return null;
  return percent >= 70 ? "positive" : percent >= 40 ? "mixed" : "negative";
};

export type ReviewLabel =
  | "overwhelmingly_positive"
  | "very_positive"
  | "positive"
  | "mostly_positive"
  | "mixed"
  | "mostly_negative"
  | "negative"
  | "very_negative"
  | "overwhelmingly_negative";

/** Steam's wording for a share of positive reviews; null where Steam shows none. */
export const getReviewLabel = (
  percent: number | null | undefined,
  count: number | null | undefined
): ReviewLabel | null => {
  if (getReviewTone(percent, count) === null) return null;
  const share = percent as number;
  const total = count as number;

  if (share >= 80) {
    if (share >= 95 && total >= 500) return "overwhelmingly_positive";
    return total >= 50 ? "very_positive" : "positive";
  }
  if (share >= 70) return "mostly_positive";
  if (share >= 40) return "mixed";
  if (share >= 20) return "mostly_negative";
  if (total >= 500) return "overwhelmingly_negative";
  return total >= 50 ? "very_negative" : "negative";
};
