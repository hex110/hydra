import { useTranslation } from "react-i18next";
import type { PlayStatus } from "@types";
import "./play-status-badge.scss";

interface PlayStatusBadgeProps {
  playStatus: PlayStatus | null | undefined;
}

export function PlayStatusBadge({
  playStatus,
}: Readonly<PlayStatusBadgeProps>) {
  const { t } = useTranslation("library");
  if (!playStatus) return null;

  const label = t(`play_status_${playStatus}`);

  return (
    <span
      className={`play-status-badge play-status-badge--${playStatus}`}
      title={label}
    >
      <span className="play-status-badge__dot" aria-hidden="true" />
      <span className="play-status-badge__label">{label}</span>
    </span>
  );
}
