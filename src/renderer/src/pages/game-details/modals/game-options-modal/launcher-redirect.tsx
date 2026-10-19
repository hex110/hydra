import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { CheckboxField } from "@renderer/components";
import { gameDetailsContext } from "@renderer/context";
import type { LibraryGame } from "@types";

const fileName = (filePath: string) => filePath.split(/[\\/]/).at(-1);

/** Shown when the game's executable is a publisher launcher Hydra runs past. */
export function LauncherRedirect({ game }: Readonly<{ game: LibraryGame }>) {
  const { t } = useTranslation("game_details");
  const { updateGame } = useContext(gameDetailsContext);
  const [redirect, setRedirect] = useState<{
    launcherPath: string;
    gamePath: string;
  } | null>(null);

  useEffect(() => {
    let current = true;
    window.electron
      .getGameLauncherRedirect(game.shop, game.objectId)
      .then((result) => {
        if (current) setRedirect(result);
      })
      .catch(() => {
        if (current) setRedirect(null);
      });

    return () => {
      current = false;
    };
  }, [game.shop, game.objectId, game.executablePath]);

  if (!redirect) return null;

  return (
    <div className="game-options-modal__launcher-redirect">
      <p className="game-options-modal__optiscaler-hint">
        {game.useGameLauncher
          ? t("launcher_redirect_off", {
              launcher: fileName(redirect.launcherPath),
            })
          : t("launcher_redirect_on", {
              launcher: fileName(redirect.launcherPath),
              game: redirect.gamePath,
            })}
      </p>
      <CheckboxField
        label={t("launcher_redirect_use_launcher")}
        checked={game.useGameLauncher === true}
        onChange={async (event) => {
          await window.electron.setGameUseLauncher(
            game.shop,
            game.objectId,
            event.target.checked
          );
          await updateGame();
        }}
      />
    </div>
  );
}
