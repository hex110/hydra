export interface SteamReviewSummary {
  /** Steam's label, such as "Very Positive". */
  label: string;
  /** Share of positive reviews, 0-100. */
  percentPositive: number;
  totalReviews: number;
}

export interface GameReception {
  reviews: SteamReviewSummary | null;
  currentPlayers: number | null;
  metacritic: { score: number; url: string | null } | null;
}

interface StoreItemsResponse {
  response?: {
    store_items?: {
      reviews?: {
        summary_filtered?: {
          review_count?: number;
          percent_positive?: number;
          review_score_label?: string;
        };
      };
    }[];
  };
}

interface CurrentPlayersResponse {
  response?: { player_count?: number; result?: number };
}

interface AppDetailsResponse {
  [appId: string]:
    | {
        success?: boolean;
        data?: { metacritic?: { score?: number; url?: string } };
      }
    | undefined;
}

/** From Steam's store browse service, asked for one app with reviews included. */
export const parseSteamReviews = (
  response: unknown
): SteamReviewSummary | null => {
  const summary = (response as StoreItemsResponse | null)?.response
    ?.store_items?.[0]?.reviews?.summary_filtered;
  const total = summary?.review_count;
  if (!summary || !total || total <= 0) return null;

  return {
    label: summary.review_score_label ?? "",
    percentPositive: Math.min(
      100,
      Math.max(0, Math.round(summary.percent_positive ?? 0))
    ),
    totalReviews: total,
  };
};

export const parseSteamCurrentPlayers = (response: unknown): number | null => {
  const body = (response as CurrentPlayersResponse | null)?.response;
  if (body?.result !== 1 || typeof body.player_count !== "number") return null;
  return body.player_count;
};

export const parseSteamMetacritic = (
  response: unknown,
  appId: string
): GameReception["metacritic"] => {
  const metacritic = (response as AppDetailsResponse | null)?.[appId]?.data
    ?.metacritic;
  if (!metacritic?.score || metacritic.score <= 0) return null;

  return {
    score: metacritic.score,
    url: metacritic.url?.startsWith("https://") ? metacritic.url : null,
  };
};
