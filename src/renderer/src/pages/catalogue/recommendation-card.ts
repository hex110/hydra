import type { ProfileGroup, Recommendation } from "@shared";

/** A recommendation as the store card shows it. */
export const toCardGame = (recommendation: Recommendation) => ({
  shop: "steam" as const,
  objectId: recommendation.appId,
  title: recommendation.title,
  libraryImageUrl: recommendation.headerImageUrl,
});

/** A taste group's name: its three tags, "Difficult / Fast-Paced / Platformer". */
export const getGroupName = (
  group: Pick<ProfileGroup, "tagIds">,
  tagLabels: ReadonlyMap<number, string>
) =>
  group.tagIds
    .map((id) => tagLabels.get(id))
    .filter((name): name is string => Boolean(name))
    .join(" / ");

/**
 * Why a game is suggested: the tags it shares with your taste. The tooltip
 * names the group it was found for and Steam's verdict.
 */
export const getRecommendationReason = (
  recommendation: Recommendation,
  tagLabels: ReadonlyMap<number, string>,
  describeGroup?: (groupId: string) => string | undefined
) => {
  const tags = recommendation.matchTagIds
    .map((id) => tagLabels.get(id))
    .filter((name): name is string => Boolean(name))
    .join(", ");

  const tooltip = [
    recommendation.groupId ? describeGroup?.(recommendation.groupId) : "",
    recommendation.reviewLabel ?? "",
  ]
    .filter(Boolean)
    .join(" · ");

  return { reason: tags || undefined, reasonTitle: tooltip || undefined };
};
