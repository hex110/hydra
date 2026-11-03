/** Fewer Steam reviews than this and the Steam part says nothing (Steam shows no score either). */
export const MIN_REVIEWS_FOR_RATING = 10;
/** How much a Metacritic score counts against a Steam part that is fully sure. */
const CRITIC_WEIGHT = 0.35;

export interface StoreRatingInput {
  /** Steam's share of positive reviews, 0–100. */
  reviewPercent: number | null | undefined;
  reviewCount: number | null | undefined;
  /** Metacritic, 0–100. */
  criticScore?: number | null;
}

export interface StoreRating {
  /** 0–100, what every sort and chip uses. */
  value: number;
  /** Steam's score adjusted for its review count, 0–100. */
  steam: number | null;
  /** Metacritic as given. */
  critic: number | null;
  reviewCount: number;
  reviewPercent: number | null;
}

/** How sure Steam's score is, 0–1: SteamDB's `1 − 2^(−log10(n + 1))`. */
const steamConfidence = (count: number) =>
  1 - Math.pow(2, -Math.log10(count + 1));

/**
 * Hydra's one rating. The Steam part is SteamDB's formula: the share of
 * positive reviews pulled toward 50 % the fewer reviews there are, so 100 %
 * of 40 ranks below 96 % of 60,000. Metacritic, when known, is blended in
 * and counts most where players have said little.
 */
export const getStoreRating = ({
  reviewPercent,
  reviewCount,
  criticScore,
}: StoreRatingInput): StoreRating | null => {
  const count = typeof reviewCount === "number" ? reviewCount : 0;
  const hasSteam =
    typeof reviewPercent === "number" && count >= MIN_REVIEWS_FOR_RATING;
  const critic =
    typeof criticScore === "number" && criticScore > 0 ? criticScore : null;

  if (!hasSteam && critic === null) return null;

  let steam: number | null = null;
  let steamWeight = 0;
  if (hasSteam) {
    const share = (reviewPercent as number) / 100;
    steamWeight = steamConfidence(count);
    steam = (share - (share - 0.5) * (1 - steamWeight)) * 100;
  }

  const criticWeight = critic === null ? 0 : CRITIC_WEIGHT;
  const value =
    steam === null
      ? (critic as number)
      : (steamWeight * steam + criticWeight * (critic ?? 0)) /
        (steamWeight + criticWeight);

  return {
    value,
    steam,
    critic,
    reviewCount: count,
    reviewPercent: hasSteam ? (reviewPercent as number) : null,
  };
};

/** The rating as 0–1 for scoring, with 0.5 when there is nothing to go on. */
export const getRatingQuality = (input: StoreRatingInput) => {
  const rating = getStoreRating(input);
  return rating ? rating.value / 100 : 0.5;
};

/** Steam's colour bands, applied to the rating. */
export const getRatingTone = (
  value: number
): "positive" | "mixed" | "negative" =>
  value >= 70 ? "positive" : value >= 40 ? "mixed" : "negative";
