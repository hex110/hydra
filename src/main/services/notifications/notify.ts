import { Notification } from "electron";
import trayIcon from "@resources/tray-icon.png?asset";

import { db, levelKeys } from "@main/level";
import {
  isNotificationPreferenceEnabled,
  notificationTargetBigPicturePath,
  notificationTargetPath,
  type NotificationPreferenceKey,
} from "@shared";
import type {
  LocalNotificationType,
  NotificationTarget,
  UserPreferences,
} from "@types";

import { logger } from "../logger";
import { WindowManager } from "../window-manager";
import { LocalNotificationManager } from "./local-notifications";
import { downloadImage } from "./notification-image";
import { NotificationOptions, toXmlString } from "./xml";

/**
 * A notification whose JS object is garbage collected loses its click handler,
 * so recent ones stay referenced. Notification servers that keep a history
 * never report a close, hence the cap instead of relying on "close".
 */
const MAX_TRACKED_NOTIFICATIONS = 50;
const trackedNotifications = new Set<Notification>();

const track = (notification: Notification) => {
  trackedNotifications.add(notification);
  if (trackedNotifications.size > MAX_TRACKED_NOTIFICATIONS) {
    const [oldest] = trackedNotifications;
    trackedNotifications.delete(oldest);
  }
  notification.once("close", () => trackedNotifications.delete(notification));
};

export interface DesktopNotificationOptions {
  title: string;
  body: string;
  icon?: string;
  silent?: boolean;
  /** Windows toast with a progress bar; see xml.ts. */
  progress?: NotificationOptions["progress"];
}

/** Shows a desktop notification whose click handler survives until it closes. */
export const showDesktopNotification = (
  options: DesktopNotificationOptions,
  onClick?: () => void
): Notification | null => {
  try {
    const xmlOptions: NotificationOptions = {
      ...options,
      icon: options.icon ?? trayIcon,
    };
    const notification = new Notification({
      title: options.title,
      body: options.body,
      icon: options.icon ?? trayIcon,
      silent: options.silent,
      // The toast template is protocol-activated, which bypasses "click", so
      // it is only used where its progress bar is wanted.
      toastXml:
        process.platform === "win32" && options.progress
          ? toXmlString(xmlOptions)
          : undefined,
    });
    notification.on("click", () => {
      trackedNotifications.delete(notification);
      (onClick ?? (() => WindowManager.bringAppToFront()))();
    });
    track(notification);
    notification.show();
    return notification;
  } catch (error) {
    logger.error("Failed to show a desktop notification", error);
    return null;
  }
};

export const openNotificationTarget = (
  target: NotificationTarget | null,
  notificationId?: string | null
) => {
  if (!target) {
    WindowManager.bringAppToFront();
    return;
  }

  WindowManager.focusMainWindowAndNavigate(
    notificationTargetPath(target, notificationId),
    { bigPicturePath: notificationTargetBigPicturePath(target) }
  );
};

export interface NotifyOptions {
  /** Inbox entry type; null for notifications that only pop up. */
  type: LocalNotificationType | null;
  title: string;
  body: string;
  /** Switch that silences the pop-up. The inbox entry is written regardless. */
  preference: NotificationPreferenceKey | null;
  target: NotificationTarget | null;
  /** Image for the pop-up and the inbox entry: a URL or `local:<path>`. */
  imageUrl?: string | null;
  /** Pop-up icon when `imageUrl` is missing or fails; defaults to the tray icon. */
  fallbackIcon?: string;
  /** Inbox picture when it should differ from the pop-up image. */
  pictureUrl?: string | null;
  silent?: boolean;
  progress?: NotificationOptions["progress"];
  /** Replaces opening `target` on click. */
  onClick?: () => void;
  signal?: AbortSignal;
}

/**
 * The one way to tell the user something happened: writes the inbox entry and
 * shows the pop-up, and both lead to the same place.
 */
export const notify = async (options: NotifyOptions): Promise<void> => {
  if (options.signal?.aborted) return;

  const entry = options.type
    ? await LocalNotificationManager.createNotification(
        options.type,
        options.title,
        options.body,
        {
          pictureUrl:
            options.pictureUrl !== undefined
              ? options.pictureUrl
              : (options.imageUrl ?? null),
          target: options.target,
        }
      )
    : null;

  if (options.preference) {
    const preferences = await db
      .get<string, UserPreferences | null>(levelKeys.userPreferences, {
        valueEncoding: "json",
      })
      .catch(() => null);
    if (!isNotificationPreferenceEnabled(preferences, options.preference))
      return;
  }

  const icon =
    (await downloadImage(options.imageUrl ?? null, options.signal).catch(
      () => undefined
    )) ?? options.fallbackIcon;
  if (options.signal?.aborted) return;

  showDesktopNotification(
    {
      title: options.title,
      body: options.body,
      icon,
      silent: options.silent,
      progress: options.progress,
    },
    () => {
      if (entry && !entry.isRead) {
        void LocalNotificationManager.markAsReadAndBroadcast(entry.id).catch(
          (error) => logger.error("Failed to mark notification read", error)
        );
      }
      if (options.onClick) options.onClick();
      else openNotificationTarget(options.target, entry?.id);
    }
  );
};
