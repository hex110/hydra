import type { TFunction } from "i18next";
import type { Recommendation } from "@shared";

/** A recommendation as the store card shows it. */
export const toCardGame = (recommendation: Recommendation) => ({
  shop: "steam" as const,
  objectId: recommendation.appId,
  title: recommendation.title,
  libraryImageUrl: recommendation.headerImageUrl,
});

/**
 * Why a game is suggested: the played game that led to it, else the tags it
 * shares with your taste. The tags and Steam's verdict go in the tooltip.
 */
export const getRecommendationReason = (
  recommendation: Recommendation,
  tagLabels: ReadonlyMap<number, string>,
  t: TFunction
) => {
  const tags = recommendation.matchTagIds
    .map((id) => tagLabels.get(id))
    .filter((name): name is string => Boolean(name))
    .join(", ");

  const reason = recommendation.becauseOf
    ? t("because_you_played", {
        ns: "home",
        title: recommendation.becauseOf.title,
      })
    : tags;

  const tooltip = [
    recommendation.becauseOf ? tags : "",
    recommendation.reviewLabel ?? "",
  ]
    .filter(Boolean)
    .join(" · ");

  return { reason: reason || undefined, reasonTitle: tooltip || undefined };
};
