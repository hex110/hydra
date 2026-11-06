import type { ReactNode } from "react";
import cn from "classnames";
import { XIcon } from "@primer/octicons-react";
import { MoreVertical } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "../badge/badge";
import { Button } from "../button/button";
import {
  DropdownMenu,
  type DropdownMenuItem,
} from "../dropdown-menu/dropdown-menu";
import { ProgressBar } from "../progress-bar/progress-bar";

import "./activity-row.scss";

export interface ActivityRowProps {
  title: string;
  /** The game's cover; `icon` stands in when the row isn't about a game. */
  coverUrl?: string | null;
  icon?: ReactNode;
  /** Opens the game page, or the page that owns the work. */
  onOpen?: () => void;
  badge?: string;
  status?: string;
  /** Full status text when `status` is shortened or detail is hidden. */
  statusTitle?: string;
  isError?: boolean;
  /** 0 to 1; null while the amount is not known yet. */
  progress?: number | null;
  showProgress?: boolean;
  progressTone?: "default" | "extraction";
  /** The one obvious next step. */
  primary?: ReactNode;
  menu?: DropdownMenuItem[];
  /** Hides a finished or failed row (or ignores an update). */
  onClear?: () => void;
  clearLabel?: string;
}

export function ActivityRow({
  title,
  coverUrl,
  icon,
  onOpen,
  badge,
  status,
  statusTitle,
  isError = false,
  progress = null,
  showProgress = false,
  progressTone = "default",
  primary,
  menu = [],
  onClear,
  clearLabel,
}: Readonly<ActivityRowProps>) {
  const { t } = useTranslation("downloads");
  const visibleMenu = menu.filter((item) => item.show !== false);

  const thumb = (
    <span className="activity-row__thumb">
      {coverUrl ? <img src={coverUrl} alt="" /> : icon}
    </span>
  );

  return (
    <li className="activity-row">
      {onOpen ? (
        <button
          type="button"
          className="activity-row__thumb-button"
          onClick={onOpen}
          tabIndex={-1}
          aria-hidden
        >
          {thumb}
        </button>
      ) : (
        thumb
      )}

      <div className="activity-row__main">
        <div className="activity-row__heading">
          {onOpen ? (
            <button
              type="button"
              className="activity-row__title"
              onClick={onOpen}
            >
              {title}
            </button>
          ) : (
            <span className="activity-row__title">{title}</span>
          )}
          {badge && <Badge>{badge}</Badge>}
        </div>

        {status && (
          <span
            className={cn("activity-row__status", {
              "activity-row__status--error": isError,
            })}
            role={isError ? "alert" : undefined}
            title={statusTitle ?? status}
          >
            {status}
          </span>
        )}

        {showProgress && (
          <div className="activity-row__progress">
            <ProgressBar
              label={title}
              now={progress ?? 0}
              max={1}
              size="small"
              tone={isError ? "error" : progressTone}
              indeterminate={progress === null}
            />
            {progress !== null && (
              <span className="activity-row__percent">
                {Math.floor(progress * 100)}%
              </span>
            )}
          </div>
        )}
      </div>

      <div className="activity-row__actions">
        {primary}

        <span className="activity-row__slot">
          {visibleMenu.length > 0 && (
            <DropdownMenu align="end" items={visibleMenu}>
              <Button
                theme="ghost"
                size="small"
                className="activity-row__icon-button"
                aria-label={t("more_actions")}
              >
                <MoreVertical size={16} />
              </Button>
            </DropdownMenu>
          )}
        </span>

        <span className="activity-row__slot">
          {onClear && (
            <Button
              theme="ghost"
              size="small"
              className="activity-row__icon-button"
              onClick={onClear}
              tooltip={clearLabel ?? t("clear")}
              aria-label={clearLabel ?? t("clear")}
            >
              <XIcon size={16} />
            </Button>
          )}
        </span>
      </div>
    </li>
  );
}
