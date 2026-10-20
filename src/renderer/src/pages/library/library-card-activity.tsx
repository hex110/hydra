import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { LibraryGame } from "@types";
import { useActiveGameSetups, useAppSelector } from "@renderer/hooks";
import { getLibraryGameActivity } from "./library-game-activity";
import "./library-card-activity.scss";

interface LibraryCardActivityProps {
  game: LibraryGame & { members?: LibraryGame[] };
}

/** Download, extraction or setup progress across the bottom of a card. */
export function LibraryCardActivity({
  game,
}: Readonly<LibraryCardActivityProps>) {
  const { t } = useTranslation("library");
  const setupGameIds = useActiveGameSetups();
  const ids = useMemo(
    () => (game.members?.length ? game.members : [game]).map(({ id }) => id),
    [game]
  );

  const activeDownloadProgress = useAppSelector((state) => {
    const packet = state.download.lastPacket;
    return packet && ids.includes(packet.gameId) ? packet.progress : null;
  });
  const activeDownloadId = useAppSelector((state) => {
    const gameId = state.download.lastPacket?.gameId;
    return gameId && ids.includes(gameId) ? gameId : null;
  });
  const extractionProgress = useAppSelector((state) => {
    const extraction = state.download.extraction;
    return extraction && ids.includes(extraction.visibleId)
      ? extraction.progress
      : null;
  });
  const extractionId = useAppSelector((state) => {
    const visibleId = state.download.extraction?.visibleId;
    return visibleId && ids.includes(visibleId) ? visibleId : null;
  });

  const activity = getLibraryGameActivity(game, {
    activeDownload:
      activeDownloadId && activeDownloadProgress !== null
        ? { gameId: activeDownloadId, progress: activeDownloadProgress }
        : null,
    extraction:
      extractionId && extractionProgress !== null
        ? { gameId: extractionId, progress: extractionProgress }
        : null,
    setupGameIds,
  });

  if (!activity) return null;

  const percent =
    activity.progress === null
      ? null
      : Math.min(100, Math.max(0, Math.round(activity.progress * 100)));

  return (
    <div
      className={`library-card-activity library-card-activity--${activity.kind}`}
      role="status"
    >
      <span className="library-card-activity__label">
        {t(`card_activity_${activity.kind}`)}
        {percent !== null && ` ${percent}%`}
      </span>
      <div className="library-card-activity__track">
        <div
          className={`library-card-activity__bar${percent === null ? " library-card-activity__bar--indeterminate" : ""}`}
          style={percent === null ? undefined : { width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
