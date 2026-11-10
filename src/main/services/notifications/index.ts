import { Notification } from "electron";
import i18next, { t } from "i18next";
import trayIcon from "@resources/tray-icon.png?asset";
import sound from "sound-play";
import { achievementSoundPath, chatMessageSoundPath } from "@main/constants";
import icon from "@resources/icon.png?asset";
import { logger } from "../logger";
import { WindowManager } from "../window-manager";
import type {
  Game,
  GameCapabilityId,
  GameCapabilityReason,
  GameUpdateFailure,
  NotificationGameRef,
  NotificationGameSection,
  NotificationTarget,
  SteamWishlistEntry,
  SteamWishlistEvent,
  UserProfile,
} from "@types";
import { themesSublevel } from "@main/level";
import { restartAndInstallUpdate } from "@main/events/autoupdater/restart-and-install-update";
import { getThemeSoundPath } from "@main/helpers";
import { summarizeTitles } from "@shared";
import type { OptiScalerLaunchCheck } from "../optiscaler/optiscaler";
import { downloadImage } from "./notification-image";
import { notify } from "./notify";

export {
  notify,
  openNotificationTarget,
  showDesktopNotification,
} from "./notify";

/** An open window plays the sound itself; sound-play has no Linux support. */
const playAchievementSound = async () => {
  if (WindowManager.mainWindow) {
    WindowManager.mainWindow.webContents.send("on-achievement-unlocked");
  } else if (process.platform !== "linux") {
    sound.play(await getAchievementSoundPath());
  }
};

async function getAchievementSoundPath(): Promise<string> {
  try {
    const allThemes = await themesSublevel.values().all();
    const activeTheme = allThemes.find((theme) => theme.isActive);

    if (activeTheme?.hasCustomSound) {
      const themeSoundPath = getThemeSoundPath(
        activeTheme.id,
        activeTheme.name
      );
      if (themeSoundPath) {
        return themeSoundPath;
      }
    }
  } catch (error) {
    logger.error("Failed to get theme sound path", error);
  }

  return achievementSoundPath;
}

const gameTarget = (
  game: Game,
  section?: NotificationGameSection
): NotificationTarget => ({
  kind: "game",
  shop: game.shop,
  objectId: game.objectId,
  section,
});

const gameRef = (game: Game): NotificationGameRef => ({
  shop: game.shop,
  objectId: game.objectId,
  title: game.title,
  iconUrl: game.iconUrl,
});

/** A list of titles for a body text, with "and others" past the first three. */
const titleList = (titles: string[]) => {
  const summary = summarizeTitles(titles);
  return summary.hasMore
    ? t("titles_and_more", { ns: "notifications", titles: summary.titles })
    : summary.titles;
};

export const publishDownloadCompleteNotification = (game: Game) =>
  notify({
    type: "DOWNLOAD_COMPLETE",
    title: t("download_complete", { ns: "notifications" }),
    body: t("game_ready_to_install", {
      ns: "notifications",
      title: game.title,
    }),
    preference: "downloadNotificationsEnabled",
    imageUrl: game.iconUrl,
    target: gameTarget(game),
  });

export const publishDownloadHaltedNotification = (game: Game) =>
  notify({
    type: "DOWNLOAD_HALTED",
    title: t("download_halted", { ns: "notifications" }),
    body: t("download_halted_no_disk_space", {
      ns: "notifications",
      title: game.title,
    }),
    preference: "downloadNotificationsEnabled",
    imageUrl: game.iconUrl,
    target: { kind: "downloads" },
  });

export const publishNotificationUpdateReadyToInstall = (version: string) =>
  notify({
    type: "UPDATE_AVAILABLE",
    title: t("new_update_available", { ns: "notifications", version }),
    body: t("restart_to_install_update", { ns: "notifications" }),
    preference: null,
    target: null,
    onClick: () => restartAndInstallUpdate(),
  });

export const publishLeaderboardNotification = (
  content: { title: string; body: string; imageUrl: string | null },
  onClick: () => void,
  signal?: AbortSignal
) =>
  notify({
    type: null,
    title: content.title,
    body: content.body,
    preference: null,
    imageUrl: content.imageUrl,
    target: null,
    onClick,
    signal,
  });

/** Friend requests are server notifications, so they are already in the inbox. */
export const publishNewFriendRequestNotification = (
  user: UserProfile,
  signal?: AbortSignal
) =>
  notify({
    type: null,
    title: t("new_friend_request_title", { ns: "notifications" }),
    body: t("new_friend_request_description", {
      ns: "notifications",
      displayName: user.displayName,
    }),
    preference: "friendRequestNotificationsEnabled",
    imageUrl: user.profileImageUrl,
    target: { kind: "path", path: "/notifications" },
    signal,
  });

/** The caller checks the switch, since it also gates the friends list update. */
export const publishFriendStartedPlayingGameNotification = (
  friend: {
    friendId: string;
    displayName: string;
    profileImageUrl: string | null;
    gameTitle: string | null;
  },
  signal?: AbortSignal
) =>
  notify({
    type: null,
    title: t("friend_started_playing_game", {
      ns: "notifications",
      displayName: friend.displayName,
    }),
    body: friend.gameTitle ?? "",
    preference: null,
    imageUrl: friend.profileImageUrl,
    target: { kind: "profile", userId: friend.friendId },
    signal,
  });

const CHAT_NOTIFICATION_BODY_MAX_LENGTH = 200;
/** Matches the chat window's own playback (chat-sounds.ts). */
const CHAT_MESSAGE_SOUND_VOLUME = 0.35;

// Like the achievement sound, an open window plays it. sound-play, which
// spawns a process per sound and has no Linux support, only covers the gap
// before any window has loaded.
const playChatMessageSound = () => {
  if (WindowManager.sendToFirstLoadedWindow("on-chat-message-sound")) return;
  if (process.platform === "linux") return;

  sound
    .play(chatMessageSoundPath, CHAT_MESSAGE_SOUND_VOLUME)
    .catch((error) => logger.error("Failed to play chat message sound", error));
};

// Windows drops click handlers of notifications that get garbage collected, so
// the latest notification per friend is kept referenced until it closes.
const chatMessageNotifications = new Map<string, Notification>();
const CHAT_UNREAD_SUMMARY_NOTIFICATION_KEY = "unread-summary";
// Bumped on sign-out. A notification from an earlier session neither shows
// nor reacts to clicks, since it would open a chat for the wrong account.
let chatNotificationSession = 0;

/** Closes every chat notification still shown, as on sign-out. */
export const closeChatNotifications = () => {
  chatNotificationSession++;

  const notifications = [...chatMessageNotifications.values()];
  chatMessageNotifications.clear();
  for (const notification of notifications) notification.close();
};

const showChatNotification = async (
  key: string,
  content: { title: string; body: string; imageUrl: string | null },
  onClick: () => void,
  signal?: AbortSignal
) => {
  if (signal?.aborted) return;
  const session = chatNotificationSession;
  const notificationIcon =
    (content.imageUrl
      ? await downloadImage(content.imageUrl, signal)
      : undefined) ?? trayIcon;
  if (signal?.aborted || session !== chatNotificationSession) return;

  chatMessageNotifications.get(key)?.close();

  // Silent: chat plays its own sound instead of the system one.
  const notification = new Notification({
    title: content.title,
    body:
      content.body.length > CHAT_NOTIFICATION_BODY_MAX_LENGTH
        ? `${content.body.slice(0, CHAT_NOTIFICATION_BODY_MAX_LENGTH)}…`
        : content.body,
    icon: notificationIcon,
    silent: true,
  });

  notification.on("click", () => {
    if (session === chatNotificationSession) onClick();
  });
  notification.on("close", () => {
    if (chatMessageNotifications.get(key) === notification) {
      chatMessageNotifications.delete(key);
    }
  });

  chatMessageNotifications.set(key, notification);
  notification.show();

  if (!WindowManager.isChatWindowFocused()) playChatMessageSound();
};

type ChatSender = Pick<UserProfile, "id" | "displayName" | "profileImageUrl">;

export const publishChatMessageNotification = (
  sender: ChatSender,
  body: string,
  onClick: () => void,
  signal?: AbortSignal
) =>
  showChatNotification(
    sender.id,
    {
      title: t("chat_message_title", {
        ns: "notifications",
        displayName: sender.displayName,
      }),
      body,
      imageUrl: sender.profileImageUrl,
    },
    onClick,
    signal
  );

/** Announces messages that arrived while the launcher was closed or offline. */
export const publishChatUnreadNotification = (
  unread:
    | { kind: "friend"; sender: ChatSender; messageCount: number }
    | { kind: "summary"; friendCount: number; messageCount: number },
  onClick: () => void,
  signal?: AbortSignal
) =>
  unread.kind === "friend"
    ? showChatNotification(
        unread.sender.id,
        {
          title: t("chat_message_title", {
            ns: "notifications",
            displayName: unread.sender.displayName,
          }),
          body: t("chat_unread_from_friend", {
            ns: "notifications",
            count: unread.messageCount,
          }),
          imageUrl: unread.sender.profileImageUrl,
        },
        onClick,
        signal
      )
    : showChatNotification(
        CHAT_UNREAD_SUMMARY_NOTIFICATION_KEY,
        {
          title: t("chat_unread_summary_title", {
            ns: "notifications",
            count: unread.messageCount,
          }),
          body: t("chat_unread_summary_body", {
            ns: "notifications",
            count: unread.friendCount,
          }),
          imageUrl: null,
        },
        onClick,
        signal
      );

export const publishCombinedNewAchievementNotification = async (
  achievementCount: number,
  gameCount: number
) => {
  await notify({
    type: null,
    title: t("achievement_unlocked", { ns: "achievement" }),
    body: t("new_achievements_unlocked", {
      ns: "achievement",
      gameCount,
      achievementCount,
    }),
    preference: null,
    fallbackIcon: icon,
    silent: true,
    target: null,
  });

  await playAchievementSound();
};

export const publishExtractionCompleteNotification = (game: Game) =>
  notify({
    type: "EXTRACTION_COMPLETE",
    title: t("extraction_complete", { ns: "notifications" }),
    body: t("game_extracted", { ns: "notifications", title: game.title }),
    preference: "downloadNotificationsEnabled",
    imageUrl: game.iconUrl,
    target: gameTarget(game),
  });

export const publishSavesFoundNotification = (
  game: Game,
  found: { files: number; achievements: number; sourceLabel: string }
) =>
  notify({
    type: "SAVES_FOUND",
    title: t("saves_found", { ns: "notifications", title: game.title }),
    body: t("saves_found_description", {
      ns: "notifications",
      files: found.files,
      achievements: found.achievements,
      source: found.sourceLabel,
    }),
    preference: "saveImportNotificationsEnabled",
    imageUrl: game.iconUrl,
    target: gameTarget(game, "save_import"),
  });

export const publishGameUpdatesNotification = (games: Game[]) =>
  notify({
    type: "GAME_UPDATES_AVAILABLE",
    title: t("game_updates_available", {
      ns: "notifications",
      count: games.length,
    }),
    body: t("game_updates_available_description", {
      ns: "notifications",
      titles: titleList(games.map((game) => game.title)),
      count: games.length,
    }),
    preference: "gameUpdateNotificationsEnabled",
    imageUrl: games.length === 1 ? games[0].iconUrl : null,
    target: { kind: "downloads" },
  });

export const publishWishlistDownloadsNotification = async (games: Game[]) => {
  if (games.length === 0) return;

  await notify({
    type: "WISHLIST_DOWNLOAD_AVAILABLE",
    title: t("wishlist_downloads_available", {
      ns: "notifications",
      count: games.length,
      title: games[0].title,
    }),
    body: t("wishlist_downloads_available_description", {
      ns: "notifications",
      titles: titleList(games.map((game) => game.title)),
      count: games.length,
    }),
    preference: "wishlistNotificationsEnabled",
    imageUrl: games[0].iconUrl,
    target: { kind: "games", games: games.map(gameRef) },
  });
};

const steamHeaderUrl = (appId: number | string) =>
  `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`;

export const publishSteamWishlistNotification = async (
  entries: SteamWishlistEntry[],
  event: SteamWishlistEvent
) => {
  if (entries.length === 0) return;

  const [first] = entries;
  const key =
    event === "released"
      ? first.isEarlyAccess && entries.length === 1
        ? "steam_wishlist_early_access"
        : "steam_wishlist_released"
      : "steam_wishlist_date_announced";

  await notify({
    type: "STEAM_WISHLIST_RELEASE",
    title: t(key, {
      ns: "notifications",
      count: entries.length,
      title: first.name,
    }),
    body: t(`${key}_description`, {
      ns: "notifications",
      count: entries.length,
      titles: titleList(entries.map((entry) => entry.name)),
      date: first.releaseDate
        ? new Date(first.releaseDate * 1000).toLocaleDateString(
            i18next.language
          )
        : "",
    }),
    preference: "wishlistNotificationsEnabled",
    // The pop-up icon is small; the header art reads better in the inbox.
    pictureUrl: steamHeaderUrl(first.appId),
    target: {
      kind: "games",
      games: entries.map((entry) => ({
        shop: "steam",
        objectId: String(entry.appId),
        title: entry.name,
        iconUrl: steamHeaderUrl(entry.appId),
      })),
    },
  });
};

export const publishGameUpdatedNotification = (
  game: Game,
  release: string | null
) =>
  notify({
    type: "GAME_UPDATED",
    title: t("game_updated", { ns: "notifications", title: game.title }),
    body: release
      ? t("game_updated_description", { ns: "notifications", release })
      : t("game_updated_description_unknown", { ns: "notifications" }),
    preference: "gameUpdateNotificationsEnabled",
    imageUrl: game.iconUrl,
    target: gameTarget(game),
  });

export const publishGameUpdateFailedNotification = (
  game: Game,
  code: GameUpdateFailure
) =>
  notify({
    type: "GAME_UPDATED",
    title: t("game_update_failed", {
      ns: "notifications",
      title: game.title,
    }),
    body: t(`game_update_failed_${code.replaceAll("-", "_")}`, {
      ns: "notifications",
    }),
    preference: "gameUpdateNotificationsEnabled",
    imageUrl: game.iconUrl,
    target: { kind: "downloads" },
  });

export const publishOptiScalerFilesMissingNotification = (
  game: Game,
  check: OptiScalerLaunchCheck,
  wrappers: string[]
) =>
  notify({
    type: "OPTISCALER_FILES_MISSING",
    title: t("optiscaler_files_missing", {
      ns: "notifications",
      title: game.title,
    }),
    body: t(
      check.repaired
        ? "optiscaler_files_missing_restored"
        : `optiscaler_files_missing_${check.reason.replaceAll("-", "_")}`,
      { ns: "notifications", wrappers: wrappers.join(", ") }
    ),
    preference: "gameToolNotificationsEnabled",
    imageUrl: game.iconUrl,
    target: gameTarget(game, "optiscaler"),
  });

export const publishCapabilityCheckFailedNotification = (
  game: Game,
  capability: GameCapabilityId,
  reason: GameCapabilityReason
) =>
  notify({
    type: "CAPABILITY_CHECK_FAILED",
    title: t("capability_check_failed", {
      ns: "notifications",
      title: game.title,
      tool: t(`capability_${capability}`, { ns: "game_details" }),
    }),
    body: t(`capability_reason_${reason.code}`, {
      ...reason.params,
      ns: "game_details",
    }),
    preference: "gameToolNotificationsEnabled",
    imageUrl: game.iconUrl,
    target: gameTarget(game, "tools"),
  });

export const publishNewAchievementNotification = async (info: {
  achievements: { title: string; iconUrl: string }[];
  unlockedAchievementCount: number;
  totalAchievementCount: number;
  game: Pick<Game, "shop" | "objectId" | "title" | "iconUrl">;
}) => {
  const isBatch = info.achievements.length > 1;

  await notify({
    type: null,
    title: isBatch
      ? t("achievements_unlocked_for_game", {
          ns: "achievement",
          gameTitle: info.game.title,
          achievementCount: info.achievements.length,
        })
      : t("achievement_unlocked", { ns: "achievement" }),
    body: isBatch
      ? info.achievements.map((a) => a.title).join(", ")
      : info.achievements[0].title,
    preference: null,
    imageUrl: isBatch ? info.game.iconUrl : info.achievements[0].iconUrl,
    fallbackIcon: icon,
    silent: true,
    progress: {
      value: info.unlockedAchievementCount / info.totalAchievementCount,
      valueOverride: t("achievement_progress", {
        ns: "achievement",
        unlockedCount: info.unlockedAchievementCount,
        totalCount: info.totalAchievementCount,
      }),
    },
    target: {
      kind: "achievements",
      shop: info.game.shop,
      objectId: info.game.objectId,
      title: info.game.title,
    },
  });

  await playAchievementSound();
};
