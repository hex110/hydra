import { useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileDirectoryIcon } from "@primer/octicons-react";

import { Button, TextField } from "@renderer/components";
import { gameDetailsContext } from "@renderer/context";
import { useToast } from "@renderer/hooks";
import { logger } from "@renderer/logger";
import type { GameRenoDxStatus, LibraryGame } from "@types";

export function RenoDxSettingsSection({
  game,
  onOpenTools,
}: Readonly<{ game: LibraryGame; onOpenTools: () => void }>) {
  const { t } = useTranslation("game_details");
  const { updateGame } = useContext(gameDetailsContext);
  const { showSuccessToast, showErrorToast } = useToast();

  const [status, setStatus] = useState<GameRenoDxStatus | null>(null);
  const [busy, setBusy] = useState<
    "install" | "install-reshade" | "uninstall" | null
  >(null);

  const refresh = useCallback(() => {
    window.electron
      .getGameRenoDxStatus(game.shop, game.objectId)
      .then(setStatus)
      .catch((error) => logger.error("Failed to load RenoDX status", error));
  }, [game.shop, game.objectId]);

  useEffect(() => {
    refresh();
  }, [refresh, game.executablePath]);

  const install = async (reShadeOnly = false) => {
    setBusy(reShadeOnly ? "install-reshade" : "install");
    const result = reShadeOnly
      ? await window.electron.installGameReShade(game.shop, game.objectId)
      : await window.electron.installGameRenoDx(game.shop, game.objectId);
    setBusy(null);

    if (result.ok) {
      showSuccessToast(
        reShadeOnly
          ? t("reshade_installed_toast")
          : t("renodx_installed_toast", { mod: result.installation.modTitle })
      );
    } else {
      showErrorToast(
        t(`renodx_error_${result.error.replaceAll("-", "_")}`, {
          message: result.message,
          defaultValue: t("renodx_install_failed", {
            message: result.message,
          }),
        })
      );
    }

    refresh();
    await updateGame();
  };

  const uninstall = async () => {
    setBusy("uninstall");
    try {
      await window.electron.uninstallGameRenoDx(game.shop, game.objectId);
      showSuccessToast(t("renodx_uninstalled_toast"));
    } catch (error) {
      logger.error("Failed to remove RenoDX", error);
      showErrorToast(t("renodx_uninstall_failed"));
    } finally {
      setBusy(null);
      refresh();
      await updateGame();
    }
  };

  if (!status) return null;

  if (!status.installDirectory) {
    return (
      <div className="game-options-modal__section">
        <div className="game-options-modal__header">
          <h2>RenoDX</h2>
          <h4 className="game-options-modal__header-description">
            {t("renodx_windows_only")}
          </h4>
        </div>
      </div>
    );
  }

  const { installation, mod, unavailable, reShade } = status;
  // ReShade alone: for a mod's ReShade add-ons or effects, when there is no
  // RenoDX mod to install with it.
  const canInstallReShadeAlone =
    !installation && !reShade && !mod && status.canInstallReShade;
  const canInstall =
    !!mod &&
    unavailable === null &&
    !status.externallyManaged &&
    !status.conflict;

  const statusText = status.externallyManaged
    ? t("renodx_status_external")
    : installation
      ? t("renodx_status_installed", {
          mod: installation.modTitle,
          reShade: installation.reShadeVersion,
        })
      : reShade
        ? t("reshade_status_installed_alone", { reShade: reShade.version })
        : t("renodx_status_not_installed");

  return (
    <>
      <div className="game-options-modal__section">
        <div className="game-options-modal__header">
          <h2>RenoDX</h2>
          <h4 className="game-options-modal__header-description">
            {statusText}
            {status.updateAvailable && ` ${t("renodx_update_available")}`}
          </h4>
        </div>

        {installation && status.missingFiles.length > 0 && (
          <p className="game-options-modal__optiscaler-hint game-options-modal__optiscaler-warning">
            {t("renodx_files_missing", {
              files: status.missingFiles.join(", "),
            })}
          </p>
        )}
        {status.conflict && (
          <p className="game-options-modal__optiscaler-hint game-options-modal__optiscaler-warning">
            {t(
              status.conflict.kind === "reshade"
                ? "renodx_conflict_reshade"
                : "renodx_conflict_other",
              { file: status.conflict.fileName, kind: status.conflict.kind }
            )}
          </p>
        )}
        {status.antiCheat && (
          <p className="game-options-modal__optiscaler-hint game-options-modal__optiscaler-warning">
            {t("renodx_anti_cheat", { name: status.antiCheat })}
          </p>
        )}
        {unavailable && (
          <p className="game-options-modal__optiscaler-hint">
            {t(`renodx_unavailable_${unavailable.replaceAll("-", "_")}`)}
          </p>
        )}

        {canInstallReShadeAlone && (
          <p className="game-options-modal__optiscaler-hint">
            {t("reshade_install_alone_hint")}
          </p>
        )}
        {reShade && (
          <p className="game-options-modal__optiscaler-hint">
            {reShade.proxyDll
              ? t("renodx_loaded_as", { proxyDll: reShade.proxyDll })
              : t("renodx_loaded_by_optiscaler")}{" "}
            {t("reshade_alone_hint")}
          </p>
        )}

        <TextField
          label={t("renodx_install_directory")}
          value={status.installDirectory}
          readOnly
          disabled
          theme="dark"
          rightContent={
            <Button
              type="button"
              theme="outline"
              onClick={() =>
                window.electron.openFolder(status.installDirectory!)
              }
            >
              <FileDirectoryIcon />
              {t("open_folder")}
            </Button>
          }
        />

        <div className="game-options-modal__row">
          {canInstall && (
            <Button
              type="button"
              theme="outline"
              disabled={busy !== null}
              onClick={() => void install()}
            >
              {busy === "install"
                ? t("renodx_installing")
                : installation
                  ? status.updateAvailable
                    ? t("renodx_update")
                    : t("renodx_reinstall")
                  : t("renodx_install")}
            </Button>
          )}
          {(canInstallReShadeAlone || (reShade && status.updateAvailable)) && (
            <Button
              type="button"
              theme="outline"
              disabled={busy !== null}
              onClick={() => void install(true)}
            >
              {busy === "install-reshade"
                ? t("renodx_installing")
                : reShade
                  ? t("renodx_update")
                  : t("reshade_install_alone")}
            </Button>
          )}
          {(installation || reShade) && (
            <Button
              type="button"
              theme="outline"
              disabled={busy !== null}
              onClick={uninstall}
            >
              {busy === "uninstall"
                ? t("renodx_uninstalling")
                : t("renodx_uninstall")}
            </Button>
          )}
        </div>
      </div>

      {mod && (
        <div className="game-options-modal__section">
          <div className="game-options-modal__header">
            <h2>{t("renodx_mod")}</h2>
          </div>

          <div className="game-options-modal__optiscaler-facts">
            <p>
              {mod.title}
              {mod.variant ? ` (${mod.variant})` : ""}
              {" - "}
              {mod.status
                ? t(`renodx_status_${mod.status}`)
                : t("renodx_status_unrated")}
            </p>
            <p>
              {status.proxyDll
                ? t("renodx_loaded_as", { proxyDll: status.proxyDll })
                : t("renodx_loaded_by_optiscaler")}
            </p>
            {mod.notes.map((note) => (
              <p key={note}>{note}</p>
            ))}
            <p>{t("renodx_overlay_hint")}</p>
            <p>{t("renodx_hdr_hint")}</p>
          </div>
        </div>
      )}

      <div className="game-options-modal__section">
        <div className="game-options-modal__header">
          <h2>{t("renodx_options")}</h2>
        </div>

        <p className="game-options-modal__header-description">
          {t(
            status.autoInstallDisabled
              ? "automatic_install_off_for_game"
              : "automatic_install_follows_tools"
          )}{" "}
          <button
            type="button"
            className="game-options-modal__link-button"
            onClick={onOpenTools}
          >
            {t("compatibility_open_tools")}
          </button>
        </p>
      </div>
    </>
  );
}
