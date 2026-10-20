import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { PlayIcon, XIcon } from "@primer/octicons-react";
import type { LibraryGame } from "@types";
import { ConfirmationModal, useGameActions } from "@renderer/components";
import { useAppSelector } from "@renderer/hooks";
import "./library-card-play-button.scss";

interface LibraryCardPlayButtonProps {
  game: LibraryGame;
  /** Keeps the button mounted while the RPCS3 confirmation is open. */
  onPendingChange: (pending: boolean) => void;
}

/** Mounted only while the card is hovered, so cards don't each run the hook. */
export function LibraryCardPlayButton({
  game,
  onPendingChange,
}: Readonly<LibraryCardPlayButtonProps>) {
  const { t } = useTranslation("game_details");
  const runningGameId = useAppSelector(
    (state) => state.gameRunning.gameRunning?.id
  );
  const {
    isGameRunning,
    handlePlayGame,
    handleCloseGame,
    rpcs3ConfirmPending,
    handleConfirmRpcs3Launch,
    handleCancelRpcs3Launch,
  } = useGameActions(game);
  const running =
    isGameRunning || (Boolean(runningGameId) && runningGameId === game.id);

  useEffect(() => {
    onPendingChange(rpcs3ConfirmPending !== null);
  }, [rpcs3ConfirmPending, onPendingChange]);

  return (
    <>
      <button
        type="button"
        className={`library-card-play-button${running ? " library-card-play-button--running" : ""}`}
        title={running ? t("close") : t("play")}
        aria-label={running ? t("close") : t("play")}
        onClick={(event) => {
          event.stopPropagation();
          void (running ? handleCloseGame() : handlePlayGame());
        }}
      >
        {running ? <XIcon size={18} /> : <PlayIcon size={18} />}
      </button>

      <ConfirmationModal
        visible={rpcs3ConfirmPending !== null}
        title={t("rpcs3_already_running_title")}
        descriptionText={t("rpcs3_already_running_description")}
        confirmButtonLabel={t("rpcs3_already_running_confirm")}
        cancelButtonLabel={t("cancel")}
        onClose={handleCancelRpcs3Launch}
        onConfirm={handleConfirmRpcs3Launch}
      />
    </>
  );
}
