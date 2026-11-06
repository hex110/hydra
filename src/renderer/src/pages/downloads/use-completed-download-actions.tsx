import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DownloadIcon,
  FileDirectoryIcon,
  PlayIcon,
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
}

/** A finished download's next step and its game menu, for an ActivityRow. */
export function useCompletedDownloadActions({
  game,
  state,
  extraManageItems,
  onExtract,
  onInstall,
  onOpenFolder,
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
            size="small"
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
            size="small"
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
            size="small"
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
            size="small"
          >
            <FileDirectoryIcon size={16} />
            {tGameDetails("open_folder")}
          </Button>
        );
      case "missing":
        return (
          <span className="activity-row__note">
            {tGameDetails("executable_status_missing_short")}
          </span>
        );
    }
  };

  const menuSlot = (
    <>
      <Button
        theme="ghost"
        size="small"
        className="activity-row__icon-button"
        aria-label={t("more_actions")}
        onClick={(event) => {
          const { right, bottom } = event.currentTarget.getBoundingClientRect();
          setMenuPosition({ x: right, y: bottom });
        }}
      >
        <MoreVertical size={16} />
      </Button>

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

  return { primary: primaryButton(), menuSlot };
}
