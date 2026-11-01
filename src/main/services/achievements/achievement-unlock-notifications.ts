import type {
  AchievementNotificationInfo,
  Game,
  SteamAchievement,
  UserPreferences,
} from "@types";
import { WindowManager } from "../window-manager";
import { publishNewAchievementNotification } from "../notifications";
import { achievementsLogger } from "../logger";
import { achievementNotificationPresenter } from "../achievement-notification-presenter-electron";
import { AchievementWatcherManager } from "./achievement-watcher-manager";
import { InGameNotices } from "../in-game-notices";
import { levelKeys } from "@main/level";
import i18next from "i18next";

/** Up to three unlocks by name in the running game, then a count. */
const showAchievementsInGame = (
  game: Game,
  achievements: SteamAchievement[]
) => {
  const t = i18next.getFixedT(null, "achievement");
  const lines =
    achievements.length > 3
      ? [t("in_game_unlocked_many", { count: achievements.length })]
      : achievements.map((achievement) =>
          t("in_game_unlocked", { title: achievement.displayName })
        );
  InGameNotices.show(levelKeys.game(game.shop, game.objectId), lines);
};

// More unlocks than this at once are almost always old history (a Steam
// cache or imported save seen for the first time), so they get one combined
// notification instead of a popup each.
const MAX_INDIVIDUAL_ACHIEVEMENT_NOTIFICATIONS = 10;

const RARE_ACHIEVEMENT_MAX_UNLOCK_PERCENTAGE = 10;

const isRareAchievement = (points: number) => {
  const rawPercentage = (50 - Math.sqrt(points)) * 2;

  return rawPercentage < RARE_ACHIEVEMENT_MAX_UNLOCK_PERCENTAGE;
};

export interface AchievementUnlockNotificationOptions {
  game: Game;
  achievements: SteamAchievement[];
  completesGame: boolean;
  unlockedAchievementCount: number;
  totalAchievementCount: number;
  userPreferences: UserPreferences | null;
}

export const buildAchievementNotificationInfo = (
  achievements: SteamAchievement[],
  completesGame: boolean
): AchievementNotificationInfo[] =>
  achievements.map((achievement, index) => ({
    title: achievement.displayName,
    description: achievement.description,
    points: achievement.points,
    isHidden: achievement.hidden,
    isRare: achievement.points ? isRareAchievement(achievement.points) : false,
    isPlatinum: completesGame && index === achievements.length - 1,
    iconUrl: achievement.icon,
  }));

export const publishAchievementUnlockNotifications = ({
  game,
  achievements,
  completesGame,
  unlockedAchievementCount,
  totalAchievementCount,
  userPreferences,
}: AchievementUnlockNotificationOptions) => {
  if (
    !achievements.length ||
    userPreferences?.achievementNotificationsEnabled === false
  ) {
    return;
  }

  showAchievementsInGame(game, achievements);

  if (achievements.length > MAX_INDIVIDUAL_ACHIEVEMENT_NOTIFICATIONS) {
    achievementsLogger.log(
      "Combining a large batch of new achievements",
      game.objectId,
      achievements.length
    );
    void AchievementWatcherManager.notifyCombinedAchievementsUnlocked(
      1,
      achievements.length
    ).catch((error) =>
      achievementsLogger.error("Failed to notify achievements", error)
    );
    return;
  }

  const achievementsInfo = buildAchievementNotificationInfo(
    achievements,
    completesGame
  );

  achievementsLogger.log(
    "Publishing achievement notification",
    game.objectId,
    game.title
  );

  const customNotificationsOnly =
    userPreferences?.achievementCustomNotificationsEnabled !== false &&
    process.platform !== "darwin";

  const position =
    userPreferences?.achievementCustomNotificationPosition ?? "top-left";

  const publishOsNotification = () =>
    publishNewAchievementNotification({
      achievements: achievementsInfo,
      unlockedAchievementCount,
      totalAchievementCount,
      gameTitle: game.title,
      gameIcon: game.iconUrl,
    });

  if (process.platform === "linux") {
    const shownInApp =
      customNotificationsOnly &&
      WindowManager.sendAchievementToFocusedWindow(position, achievementsInfo);

    if (!shownInApp) {
      void publishOsNotification();
    }
  } else if (customNotificationsOnly) {
    achievementNotificationPresenter.enqueueAchievements(
      position,
      achievementsInfo
    );
  } else {
    void publishOsNotification();
  }
};
