import { useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { GearIcon, SyncIcon } from "@primer/octicons-react";

import { Button, ConfirmationModal } from "@renderer/components";
import { gameDetailsContext } from "@renderer/context";
import { useToast } from "@renderer/hooks";
import { formatBytes } from "@shared";
import type { LibraryGame, WinePrefixInfo } from "@types";

export function PrefixTools({ game }: Readonly<{ game: LibraryGame }>) {
  const { t } = useTranslation("game_details");
  const { updateGame } = useContext(gameDetailsContext);
  const { showErrorToast, showSuccessToast } = useToast();
  const [info, setInfo] = useState<WinePrefixInfo | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  const refresh = useCallback(() => {
    window.electron
      .getGameWinePrefixInfo(game.shop, game.objectId)
      .then(setInfo)
      .catch(() => setInfo(null));
  }, [game.shop, game.objectId]);

  useEffect(refresh, [refresh, game.winePrefixPath, game.setupLog]);

  const openWinecfg = async () => {
    const opened = await window.electron.openGameWinecfg(
      game.shop,
      game.objectId
    );
    if (!opened) showErrorToast(t("prefix_winecfg_failed"));
  };

  const reset = async () => {
    setConfirmReset(false);
    setResetting(true);
    const result = await window.electron.resetGameWinePrefix(
      game.shop,
      game.objectId
    );
    setResetting(false);
    if (result.ok) {
      showSuccessToast(t("prefix_reset_done"));
    } else {
      showErrorToast(t(`prefix_reset_${result.error.replaceAll("-", "_")}`));
    }
    refresh();
    await updateGame();
  };

  if (!game.executablePath?.toLowerCase().endsWith(".exe")) return null;

  return (
    <div className="game-options-modal__section">
      <div className="game-options-modal__header">
        <h2>{t("prefix_tools")}</h2>
        <h4 className="game-options-modal__header-description">
          {info?.exists
            ? t("prefix_size", {
                size: formatBytes(info.sizeInBytes ?? 0),
                path: info.path,
              })
            : t("prefix_missing")}
        </h4>
      </div>

      <div className="game-options-modal__row">
        <Button
          type="button"
          theme="outline"
          disabled={!info?.exists}
          onClick={openWinecfg}
        >
          <GearIcon size={14} />
          winecfg
        </Button>
        <Button
          type="button"
          theme="outline"
          disabled={resetting || !info?.path}
          onClick={() => setConfirmReset(true)}
        >
          <SyncIcon size={14} />
          {resetting ? t("prefix_resetting") : t("prefix_reset")}
        </Button>
      </div>

      <ConfirmationModal
        visible={confirmReset}
        title={t("prefix_reset_title")}
        descriptionText={t("prefix_reset_description", {
          path: info?.path ?? "",
        })}
        confirmButtonLabel={t("prefix_reset")}
        cancelButtonLabel={t("cancel")}
        onConfirm={reset}
        onClose={() => setConfirmReset(false)}
      />
    </div>
  );
}
