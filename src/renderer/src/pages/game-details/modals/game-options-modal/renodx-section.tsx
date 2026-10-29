import { useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileDirectoryIcon } from "@primer/octicons-react";

import { Button, CheckboxField, TextField } from "@renderer/components";
import { gameDetailsContext } from "@renderer/context";
import { useToast } from "@renderer/hooks";
import { logger } from "@renderer/logger";
import type { GameRenoDxStatus, LibraryGame } from "@types";

export function RenoDxSettingsSection({
  game,
}: Readonly<{ game: LibraryGame }>) {
  const { t } = useTranslation("game_details");
  const { updateGame } = useContext(gameDetailsContext);
  const { showSuccessToast, showErrorToast } = useToast();

  const [status, setStatus] = useState<GameRenoDxStatus | null>(null);
  const [busy, setBusy] = useState<"install" | "uninstall" | null>(null);

  const refresh = useCallback(() => {
    window.electron
      .getGameRenoDxStatus(game.shop, game.objectId)
      .then(setStatus)
      .catch((error) => logger.error("Failed to load RenoDX status", error));
  }, [game.shop, game.objectId]);

  useEffect(() => {
    refresh();
  }, [refresh, game.executablePath]);

  const install = async () => {
    setBusy("install");
    const result = await window.electron.installGameRenoDx(
      game.shop,
      game.objectId
    );
    setBusy(null);

    if (result.ok) {
      showSuccessToast(
        t("renodx_installed_toast", { mod: result.installation.modTitle })
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

  const toggleAutoInstall = async () => {
    await window.electron.setGameRenoDxAutoInstallDisabled(
      game.shop,
      game.objectId,
      !status?.autoInstallDisabled
    );
    refresh();
    await updateGame();
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

  const { installation, mod, unavailable } = status;
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
        {unavailable && (
          <p className="game-options-modal__optiscaler-hint">
            {t(`renodx_unavailable_${unavailable.replaceAll("-", "_")}`)}
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
              onClick={install}
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
          {installation && (
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
              {status.proxyDll
                ? ` ${t("renodx_loaded_as", { proxyDll: status.proxyDll })}`
                : ` ${t("renodx_loaded_by_optiscaler")}`}
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

        <CheckboxField
          label={t("renodx_disable_auto_install")}
          checked={status.autoInstallDisabled}
          onChange={toggleAutoInstall}
        />
      </div>
    </>
  );
}
