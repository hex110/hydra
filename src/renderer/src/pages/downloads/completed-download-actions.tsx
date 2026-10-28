import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DownloadIcon,
  FileDirectoryIcon,
  PlayIcon,
  XIcon,
} from "@primer/octicons-react";
import { MoreVertical } from "lucide-react";

import {
  Button,
  ConfirmationModal,
  GameContextMenu,
  useGameActions,
  type ContextMenuItemData,
} from "@renderer/components";
import { useCollectionContextMenu } from "@renderer/context";
import type { LibraryGame } from "@types";

export type CompletedDownloadState =
  | "play"
  | "extract"
  | "install"
  | "open-folder"
  | "missing";

interface CompletedDownloadActionsProps {
  game: LibraryGame;
  state: CompletedDownloadState;
  extraManageItems?: ContextMenuItemData[];
  onExtract: () => void;
  onInstall: () => void;
  onOpenFolder: () => void;
  /** Absent when the download can't be cleared, e.g. while it seeds. */
  onClear?: () => void;
}

export function CompletedDownloadActions({
  game,
  state,
  extraManageItems,
  onExtract,
  onInstall,
  onOpenFolder,
  onClear,
}: Readonly<CompletedDownloadActionsProps>) {
  const { t } = useTranslation("downloads");
  const { t: tGameDetails } = useTranslation("game_details");
  const { openCollectionContextMenu } = useCollectionContextMenu();
  const {
    isDeleting,
    isGameRunning,
    handlePlayGame,
    handleCloseGame,
    rpcs3ConfirmPending,
    handleConfirmRpcs3Launch,
    handleCancelRpcs3Launch,
  } = useGameActions(game);
  const [menuPosition, setMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const primaryButton = () => {
    switch (state) {
      case "play":
        return (
          <Button
            theme="primary"
            onClick={isGameRunning ? handleCloseGame : handlePlayGame}
            disabled={isDeleting}
            className="download-group__simple-action-btn"
          >
            <PlayIcon size={16} />
            {isGameRunning ? tGameDetails("close") : tGameDetails("play")}
          </Button>
        );
      case "extract":
        return (
          <Button
            theme="primary"
            onClick={onExtract}
            disabled={isDeleting}
            className="download-group__simple-action-btn"
          >
            <FileDirectoryIcon size={16} />
            {t("extract")}
          </Button>
        );
      case "install":
        return (
          <Button
            theme="primary"
            onClick={onInstall}
            disabled={isDeleting}
            className="download-group__simple-action-btn"
          >
            <DownloadIcon size={16} />
            {t("install")}
          </Button>
        );
      case "open-folder":
        return (
          <Button
            theme="primary"
            onClick={onOpenFolder}
            disabled={isDeleting}
            className="download-group__simple-action-btn"
          >
            <FileDirectoryIcon size={16} />
            {tGameDetails("open_folder")}
          </Button>
        );
      case "missing":
        return (
          <span className="download-group__simple-missing">
            {tGameDetails("executable_status_missing_short")}
          </span>
        );
    }
  };

  return (
    <>
      {primaryButton()}

      <Button
        theme="outline"
        className="download-group__simple-menu-btn"
        onClick={(event) => {
          const { right, bottom } = event.currentTarget.getBoundingClientRect();
          setMenuPosition({ x: right, y: bottom });
        }}
      >
        <MoreVertical size={16} />
      </Button>

      {onClear && (
        <Button
          theme="outline"
          className="download-group__simple-menu-btn"
          onClick={onClear}
          tooltip={t("clear_download")}
        >
          <XIcon size={16} />
        </Button>
      )}

      <GameContextMenu
        game={game}
        visible={menuPosition !== null}
        position={menuPosition ?? { x: 0, y: 0 }}
        onClose={() => setMenuPosition(null)}
        onCollectionContextMenu={openCollectionContextMenu}
        extraManageItems={extraManageItems}
      />

      <ConfirmationModal
        visible={rpcs3ConfirmPending !== null}
        title={tGameDetails("rpcs3_already_running_title")}
        descriptionText={tGameDetails("rpcs3_already_running_description")}
        confirmButtonLabel={tGameDetails("rpcs3_already_running_confirm")}
        cancelButtonLabel={tGameDetails("cancel")}
        onClose={handleCancelRpcs3Launch}
        onConfirm={handleConfirmRpcs3Launch}
      />
    </>
  );
}
