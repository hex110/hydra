import type {
  NotificationGameSection,
  NotificationTarget,
  UserPreferences,
} from "@types";

export const NOTIFICATION_GAME_SECTIONS: readonly NotificationGameSection[] = [
  "save_import",
  "runs",
  "tools",
  "optiscaler",
];

/** Most inbox entries kept; older ones are pruned when a new one arrives. */
export const LOCAL_NOTIFICATION_LIMIT = 200;

export type NotificationPreferenceKey =
  | "downloadNotificationsEnabled"
  | "repackUpdatesNotificationsEnabled"
  | "wishlistNotificationsEnabled"
  | "gameUpdateNotificationsEnabled"
  | "gameToolNotificationsEnabled"
  | "saveImportNotificationsEnabled"
  | "friendRequestNotificationsEnabled"
  | "friendStartGameNotificationsEnabled"
  | "chatMessageNotificationsEnabled"
  | "achievementNotificationsEnabled"
  | "leaderboardDropNotificationsEnabled";

/** What an unset switch means; shared by the settings page and the main process. */
export const NOTIFICATION_PREFERENCE_DEFAULTS: Record<
  NotificationPreferenceKey,
  boolean
> = {
  // On, unlike upstream: extraction, which used to pop up unconditionally,
  // now shares this switch.
  downloadNotificationsEnabled: true,
  repackUpdatesNotificationsEnabled: false,
  wishlistNotificationsEnabled: true,
  gameUpdateNotificationsEnabled: true,
  gameToolNotificationsEnabled: true,
  saveImportNotificationsEnabled: true,
  friendRequestNotificationsEnabled: false,
  friendStartGameNotificationsEnabled: true,
  chatMessageNotificationsEnabled: true,
  achievementNotificationsEnabled: true,
  leaderboardDropNotificationsEnabled: true,
};

export const isNotificationPreferenceEnabled = (
  preferences: UserPreferences | null | undefined,
  key: NotificationPreferenceKey
) => preferences?.[key] ?? NOTIFICATION_PREFERENCE_DEFAULTS[key];

const gamePath = (shop: string, objectId: string) =>
  `/game/${encodeURIComponent(shop)}/${encodeURIComponent(objectId)}`;

/**
 * The main-window route a target opens. A notification about several games
 * opens its own inbox entry, which lists them, so `notificationId` is needed.
 */
export const notificationTargetPath = (
  target: NotificationTarget,
  notificationId?: string | null
): string => {
  switch (target.kind) {
    case "game":
      return target.section
        ? `${gamePath(target.shop, target.objectId)}?options=${target.section}`
        : gamePath(target.shop, target.objectId);
    case "games": {
      if (target.games.length === 1) {
        const [game] = target.games;
        return gamePath(game.shop, game.objectId);
      }
      return notificationId
        ? `/notifications?highlight=${encodeURIComponent(notificationId)}`
        : "/notifications";
    }
    case "achievements": {
      const params = new URLSearchParams({
        title: target.title,
        shop: target.shop,
        objectId: target.objectId,
        userId: "",
      });
      return `/achievements/?${params.toString()}`;
    }
    case "profile":
      return `/profile/${encodeURIComponent(target.userId)}`;
    case "downloads":
      return "/downloads";
    case "library-scan":
      return "/library?openScanModal=true";
    case "path":
      return target.path.startsWith("/") ? target.path : `/${target.path}`;
  }
};

const BIG_PICTURE_ROUTES = [
  /^\/game\/[^/?#]+\/[^/?#]+(\/achievements)?$/,
  /^\/profile(\/[^/?#]+)?$/,
  /^\/(downloads|library|catalogue|settings)$/,
];

/**
 * The Big Picture route for a target, or null when Big Picture has no page for
 * it (the inbox, for one); the window is then only brought forward.
 */
export const notificationTargetBigPicturePath = (
  target: NotificationTarget
): string | null => {
  if (target.kind === "achievements") {
    return `/big-picture${gamePath(target.shop, target.objectId)}/achievements`;
  }
  if (target.kind === "library-scan") return "/big-picture/library";
  if (target.kind === "games" && target.games.length !== 1) return null;

  const [pathname] = notificationTargetPath(target).split("?");
  return BIG_PICTURE_ROUTES.some((route) => route.test(pathname))
    ? `/big-picture${pathname}`
    : null;
};

/** Up to `limit` titles, plus whether some were left out. */
export const summarizeTitles = (titles: string[], limit = 3) => ({
  titles: titles.slice(0, limit).join(", "),
  hasMore: titles.length > limit,
});
