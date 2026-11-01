import { memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import cn from "classnames";
import { ImageIcon } from "@primer/octicons-react";
import type { LibraryGame } from "@types";
import { formatBytes, getDisplayedPlayTimeInMilliseconds } from "@shared";
import { useDate, useGameCard } from "@renderer/hooks";
import { isGameReadyToPlay } from "@renderer/helpers";
import { LibraryCardPlayButton } from "./library-card-play-button";
import { PlayStatusBadge } from "./play-status-badge";
import { SaveBackupAlert } from "./save-backup-alert";
import { getLibraryListTemplate, type LibraryListColumn } from "./library-list";
import "./library-list.scss";

interface LibraryListRowProps {
  game: LibraryGame;
  columns: LibraryListColumn[];
  onCardClick?: (game: LibraryGame, event: React.MouseEvent) => boolean;
  onCardDoubleClick?: (game: LibraryGame) => void;
  selected?: boolean;
  focused?: boolean;
  onContextMenu: (
    game: LibraryGame,
    position: { x: number; y: number }
  ) => void;
}

export const LibraryListRow = memo(function LibraryListRow({
  game,
  columns,
  onCardClick,
  onCardDoubleClick,
  selected = false,
  focused = false,
  onContextMenu,
}: Readonly<LibraryListRowProps>) {
  const { t } = useTranslation("library");
  const { formatPlayTime, handleCardClick, handleContextMenuClick } =
    useGameCard(game, onContextMenu);
  const { formatDistance, formatDate } = useDate();
  const [hovered, setHovered] = useState(false);
  const [playPending, setPlayPending] = useState(false);
  const handlePlayPendingChange = useCallback(
    (pending: boolean) => setPlayPending(pending),
    []
  );
  const [iconFailed, setIconFailed] = useState(false);

  const installed = isGameReadyToPlay(game);
  const icon = game.iconUrl || game.coverImageUrl;
  const playTime = getDisplayedPlayTimeInMilliseconds(game);
  const empty = <span className="library-list__empty">–</span>;

  const renderCell = (column: LibraryListColumn) => {
    switch (column) {
      case "playtime":
        return playTime >= 60_000 ? formatPlayTime(playTime) : empty;
      case "last_played":
        return game.lastTimePlayed
          ? formatDistance(game.lastTimePlayed, new Date(), {
              addSuffix: true,
            })
          : empty;
      case "added":
        return game.addedToLibraryAt
          ? formatDate(game.addedToLibraryAt)
          : empty;
      case "status":
        return game.playStatus ? (
          <PlayStatusBadge playStatus={game.playStatus} />
        ) : (
          empty
        );
      case "rating":
        return game.rating
          ? t("list_rating_value", { rating: game.rating })
          : empty;
      case "size":
        return installed && game.installedSizeInBytes
          ? formatBytes(game.installedSizeInBytes)
          : empty;
      default:
        return null;
    }
  };

  return (
    <div
      className={cn("library-list__row", {
        "library-list__row--not-installed": !installed,
        "library-list__row--selected": selected,
        "library-list__row--focused": focused,
      })}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        className="library-list__row-button"
        style={{ gridTemplateColumns: getLibraryListTemplate(columns) }}
        onClick={(event) => {
          if (onCardClick?.(game, event)) return;
          handleCardClick();
        }}
        onDoubleClick={() => onCardDoubleClick?.(game)}
        onContextMenu={handleContextMenuClick}
        aria-pressed={onCardClick ? selected : undefined}
      >
        <span className="library-list__title-cell">
          <span className="library-list__icon">
            {icon && !iconFailed ? (
              <img
                src={icon}
                alt=""
                loading="lazy"
                onError={() => setIconFailed(true)}
              />
            ) : (
              <ImageIcon size={16} />
            )}
          </span>
          <span className="library-list__title">{game.title}</span>
          <SaveBackupAlert game={game} variant="row" />
        </span>
        {columns.map((column) => (
          <span key={column} className="library-list__cell">
            {renderCell(column)}
          </span>
        ))}
      </button>
      {installed && (hovered || playPending) && (
        <LibraryCardPlayButton
          game={game}
          onPendingChange={handlePlayPendingChange}
        />
      )}
    </div>
  );
});
