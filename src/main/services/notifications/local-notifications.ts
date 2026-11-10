import { localNotificationsSublevel } from "@main/level";
import { WindowManager } from "../window-manager";
import type {
  LocalNotification,
  LocalNotificationType,
  NotificationTarget,
} from "@types";
import { LOCAL_NOTIFICATION_LIMIT, notificationTargetPath } from "@shared";
import crypto from "node:crypto";

export class LocalNotificationManager {
  private static generateId(): string {
    return crypto.randomBytes(8).toString("hex");
  }

  static async createNotification(
    type: LocalNotificationType,
    title: string,
    description: string,
    options?: {
      pictureUrl?: string | null;
      target?: NotificationTarget | null;
    }
  ): Promise<LocalNotification> {
    const id = this.generateId();
    const target = options?.target ?? null;
    const notification: LocalNotification = {
      id,
      type,
      title,
      description,
      pictureUrl: options?.pictureUrl ?? null,
      url: target ? notificationTargetPath(target, id) : null,
      target,
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    await localNotificationsSublevel.put(id, notification);
    await this.prune();

    WindowManager.sendToAppWindows(
      "on-local-notification-created",
      notification
    );

    return notification;
  }

  static async getNotifications(): Promise<LocalNotification[]> {
    const notifications: LocalNotification[] = [];

    for await (const [, value] of localNotificationsSublevel.iterator()) {
      notifications.push(value);
    }

    // Sort by createdAt descending
    return notifications.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  static async getUnreadCount(): Promise<number> {
    let count = 0;

    for await (const [, value] of localNotificationsSublevel.iterator()) {
      if (!value.isRead) {
        count++;
      }
    }

    return count;
  }

  static async markAsRead(id: string): Promise<void> {
    const notification = await localNotificationsSublevel.get(id);
    if (notification) {
      notification.isRead = true;
      await localNotificationsSublevel.put(id, notification);
    }
  }

  /** Marks an entry read from outside the inbox, e.g. a desktop click. */
  static async markAsReadAndBroadcast(id: string): Promise<void> {
    await this.markAsRead(id);
    WindowManager.sendToAppWindows("on-local-notification-read", id);
  }

  private static async prune(): Promise<void> {
    const notifications = await this.getNotifications();
    const excess = notifications.slice(LOCAL_NOTIFICATION_LIMIT);
    if (excess.length === 0) return;

    const batch = localNotificationsSublevel.batch();
    for (const { id } of excess) batch.del(id);
    await batch.write();
  }

  static async markAsUnread(id: string): Promise<void> {
    const notification = await localNotificationsSublevel.get(id);
    if (notification) {
      notification.isRead = false;
      await localNotificationsSublevel.put(id, notification);
    }
  }

  static async markAllAsRead(): Promise<void> {
    const batch = localNotificationsSublevel.batch();

    for await (const [key, value] of localNotificationsSublevel.iterator()) {
      if (!value.isRead) {
        value.isRead = true;
        batch.put(key, value);
      }
    }

    await batch.write();
  }

  static async deleteNotification(id: string): Promise<void> {
    await localNotificationsSublevel.del(id);
  }

  static async clearAll(): Promise<void> {
    await localNotificationsSublevel.clear();
  }
}
