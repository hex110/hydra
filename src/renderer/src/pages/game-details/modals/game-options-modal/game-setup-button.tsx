import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@renderer/components";
import { gameDetailsContext } from "@renderer/context";
import { useToast } from "@renderer/hooks";
import type { LibraryGame } from "@types";

export function GameSetupButton({ game }: Readonly<{ game: LibraryGame }>) {
  const { t } = useTranslation("game_details");
  const { updateGame } = useContext(gameDetailsContext);
  const { showSuccessToast, showErrorToast } = useToast();
  const [running, setRunning] = useState(false);

  useEffect(() => {
    return window.electron.onGameSetupStatus((event) => {
      if (event.shop !== game.shop || event.objectId !== game.objectId) return;

      if (event.status === "queued" || event.status === "running") {
        setRunning(true);
        return;
      }

      setRunning(false);
      if (event.status === "completed") {
        showSuccessToast(t("game_setup_completed"));
      } else if (event.status === "failed") {
        showErrorToast(t("game_setup_failed"));
      }
      void updateGame();
    });
  }, [
    game.shop,
    game.objectId,
    showSuccessToast,
    showErrorToast,
    t,
    updateGame,
  ]);

  return (
    <Button
      type="button"
      theme="outline"
      disabled={running || !game.executablePath}
      onClick={() => {
        setRunning(true);
        void window.electron.runGameSetup(game.shop, game.objectId);
      }}
    >
      {running ? t("game_setup_running") : t("run_game_setup")}
    </Button>
  );
}
