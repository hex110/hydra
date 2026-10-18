import { useContext } from "react";
import { useTranslation } from "react-i18next";

import { MangoHudEditor, RadioField } from "@renderer/components";
import { gameDetailsContext } from "@renderer/context";
import { useAppSelector } from "@renderer/hooks";
import { DEFAULT_MANGOHUD_SETTINGS } from "@shared";
import type { LibraryGame, MangoHudSettings } from "@types";

export function GameMangoHud({ game }: Readonly<{ game: LibraryGame }>) {
  const { t } = useTranslation("game_details");
  const { updateGame } = useContext(gameDetailsContext);
  const defaultLayout = useAppSelector(
    (state) => state.userPreferences.value?.mangoHud ?? null
  );

  const save = async (settings: MangoHudSettings | null) => {
    await window.electron.setGameMangoHud(game.shop, game.objectId, settings);
    await updateGame();
  };

  const custom = !!game.mangoHud;

  return (
    <div className="game-options-modal__section">
      <div className="game-options-modal__header">
        <h2>{t("mangohud_layout")}</h2>
        <h4 className="game-options-modal__header-description">
          {t("mangohud_layout_description")}
        </h4>
      </div>

      <RadioField
        name={`mangohud-layout-${game.objectId}`}
        label={
          defaultLayout
            ? t("mangohud_layout_default")
            : t("mangohud_layout_mangohud_config")
        }
        checked={!custom}
        onChange={() => save(null)}
      />
      <RadioField
        name={`mangohud-layout-${game.objectId}`}
        label={t("mangohud_layout_custom")}
        checked={custom}
        onChange={() => save(defaultLayout ?? DEFAULT_MANGOHUD_SETTINGS)}
      />

      {game.mangoHud && (
        <MangoHudEditor value={game.mangoHud} onChange={save} />
      )}
    </div>
  );
}
