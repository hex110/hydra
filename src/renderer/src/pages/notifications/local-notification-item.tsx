import { forwardRef, useCallback } from "react";
import {
  AlertIcon,
  StarIcon,
  XIcon,
  DownloadIcon,
  PackageIcon,
  SyncIcon,
  TrophyIcon,
  ClockIcon,
  HistoryIcon,
} from "@primer/octicons-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useDate } from "@renderer/hooks";
import { notificationTargetPath } from "@shared";
import cn from "classnames";

import type { LocalNotification, NotificationGameRef } from "@types";
import "./notification-item.scss";

interface LocalNotificationItemProps {
  notification: LocalNotification;
  isHighlighted?: boolean;
  onDismiss: (id: string) => void;
  onMarkAsRead: (id: string) => void;
}

const getIcon = (type: LocalNotification["type"]) => {
  switch (type) {
    case "DOWNLOAD_COMPLETE":
      return <DownloadIcon size={24} />;
    case "EXTRACTION_COMPLETE":
      return <PackageIcon size={24} />;
    case "ACHIEVEMENT_UNLOCKED":
      return <TrophyIcon size={24} />;
    case "SAVES_FOUND":
      return <HistoryIcon size={24} />;
    case "UPDATE_AVAILABLE":
    case "SCAN_GAMES_COMPLETE":
    case "GAME_UPDATES_AVAILABLE":
    case "GAME_UPDATED":
      return <SyncIcon size={24} />;
    case "WISHLIST_DOWNLOAD_AVAILABLE":
    case "STEAM_WISHLIST_RELEASE":
      return <StarIcon size={24} />;
    case "OPTISCALER_FILES_MISSING":
    case "CAPABILITY_CHECK_FAILED":
    case "DOWNLOAD_HALTED":
      return <AlertIcon size={24} />;
    default:
      return <DownloadIcon size={24} />;
  }
};

export const LocalNotificationItem = forwardRef<
  HTMLDivElement,
  Readonly<LocalNotificationItemProps>
>(function LocalNotificationItem(
  { notification, isHighlighted = false, onDismiss, onMarkAsRead },
  ref
) {
  const { t } = useTranslation("notifications_page");
  const { formatDistance } = useDate();
  const navigate = useNavigate();

  const { target } = notification;
  // A notification about several games is its own destination: it lists them.
  const games =
    target?.kind === "games" && target.games.length > 1 ? target.games : [];

  const markAsRead = useCallback(() => {
    if (!notification.isRead) onMarkAsRead(notification.id);
  }, [notification.id, notification.isRead, onMarkAsRead]);

  const handleClick = useCallback(() => {
    markAsRead();
    if (games.length > 0) return;

    const path = target
      ? notificationTargetPath(target, notification.id)
      : notification.url;
    if (path) navigate(path);
  }, [games.length, markAsRead, navigate, notification, target]);

  const handleOpenGame = useCallback(
    (game: NotificationGameRef) => {
      markAsRead();
      navigate(
        notificationTargetPath({
          kind: "game",
          shop: game.shop,
          objectId: game.objectId,
        })
      );
    },
    [markAsRead, navigate]
  );

  const handleDismiss = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDismiss(notification.id);
    },
    [notification.id, onDismiss]
  );

  return (
    <div
      ref={ref}
      className={cn("notification-item", "notification-item--stacked", {
        "notification-item--unread": !notification.isRead,
        "notification-item--highlighted": isHighlighted,
      })}
    >
      <button
        type="button"
        className="notification-item__main"
        onClick={handleClick}
      >
        <div className="notification-item__picture">
          {notification.pictureUrl ? (
            <img src={notification.pictureUrl} alt="" />
          ) : (
            getIcon(notification.type)
          )}
        </div>

        <div className="notification-item__content">
          <span className="notification-item__title">{notification.title}</span>
          <span className="notification-item__description">
            {notification.description}
          </span>
          <span className="notification-item__time">
            <ClockIcon size={12} />
            {formatDistance(new Date(notification.createdAt), new Date())}
          </span>
        </div>
      </button>

      {games.length > 0 && (
        <ul
          className="notification-item__games"
          aria-label={t("notification_games", { count: games.length })}
        >
          {games.map((game) => (
            <li key={`${game.shop}:${game.objectId}`}>
              <button
                type="button"
                className="notification-item__game"
                onClick={() => handleOpenGame(game)}
              >
                {game.iconUrl && <img src={game.iconUrl} alt="" />}
                <span>{game.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        className="notification-item__dismiss"
        onClick={handleDismiss}
        title={t("dismiss")}
      >
        <XIcon size={16} />
      </button>
    </div>
  );
});
