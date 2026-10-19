import type {
  AchievementNotificationInfo,
  SteamAchievement,
  UnlockedAchievement,
} from "@types";

const isRareAchievement = (points: number) => {
  const rawPercentage = (50 - Math.sqrt(points)) * 2;

  return rawPercentage < 10;
};

/**
 * One notification entry per new unlock, oldest first. An unlock the
 * catalogue has no entry for still gets one, under its raw name and the
 * fallback (game) icon.
 */
export const buildAchievementNotificationInfo = ({
  newAchievements,
  achievementsData,
  previouslyUnlockedCount,
  fallbackIconUrl,
}: {
  newAchievements: UnlockedAchievement[];
  achievementsData: SteamAchievement[];
  previouslyUnlockedCount: number;
  fallbackIconUrl: string | null;
}): AchievementNotificationInfo[] => {
  const sortedAchievements = newAchievements.toSorted(
    (a, b) => a.unlockTime - b.unlockTime
  );

  return sortedAchievements.map((achievement, index) => {
    const metadata = achievementsData.find(
      (steamAchievement) =>
        achievement.name.toUpperCase() === steamAchievement.name.toUpperCase()
    );

    return {
      title: metadata?.displayName ?? achievement.name,
      description: metadata?.description,
      points: metadata?.points,
      isHidden: metadata?.hidden ?? false,
      isRare: metadata?.points ? isRareAchievement(metadata.points) : false,
      isPlatinum:
        index === sortedAchievements.length - 1 &&
        newAchievements.length + previouslyUnlockedCount ===
          achievementsData.length,
      iconUrl: metadata?.icon ?? fallbackIconUrl ?? "",
    };
  });
};
