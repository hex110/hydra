import { useContext } from "react";
import { useTranslation } from "react-i18next";

import { CheckboxField } from "@renderer/components";
import { gameDetailsContext } from "@renderer/context";
import { useToast } from "@renderer/hooks";
import type { LibraryGame } from "@types";

/** Whether Steam's playtime counts on top of Hydra's or only where it is longer. */
export function SteamPlaytimeSection({
  game,
}: Readonly<{ game: LibraryGame }>) {
  const { t } = useTranslation("game_details");
  const { updateGame } = useContext(gameDetailsContext);
  const { showErrorToast } = useToast();

  if (game.shop !== "steam") return null;

  const toggle = async () => {
    try {
      await window.electron.setGameSteamPlaytimeAdditive(
        game.objectId,
        game.steamPlaytimeAdditive !== true
      );
      await updateGame();
    } catch {
      showErrorToast(t("steam_playtime_additive_failed"));
    }
  };

  return (
    <div className="game-options-modal__details-field">
      <CheckboxField
        label={t("steam_playtime_additive")}
        checked={game.steamPlaytimeAdditive === true}
        onChange={() => void toggle()}
      />
      <p className="game-options-modal__optiscaler-hint">
        {t("steam_playtime_additive_hint")}
      </p>
    </div>
  );
}
