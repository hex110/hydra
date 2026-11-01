import { CloudAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { LibraryGame } from "@types";
import { useSaveSyncStatus } from "@renderer/hooks";
import "./save-backup-alert.scss";

/**
 * Shown only when the last automatic save backup failed or found a conflict;
 * the game page's save widget explains and fixes it.
 */
export function SaveBackupAlert({
  game,
  variant = "card",
}: Readonly<{ game: LibraryGame; variant?: "card" | "row" }>) {
  const { t } = useTranslation("library");
  const status = useSaveSyncStatus(game.shop, game.objectId);
  if (!status || status.status === "completed") return null;

  const label = t(
    status.status === "conflict"
      ? "save_backup_conflict_tooltip"
      : "save_backup_failed_tooltip"
  );

  return (
    <span
      className={`save-backup-alert save-backup-alert--${variant}`}
      title={label}
      role="img"
      aria-label={label}
    >
      <CloudAlert size={14} aria-hidden="true" />
    </span>
  );
}
