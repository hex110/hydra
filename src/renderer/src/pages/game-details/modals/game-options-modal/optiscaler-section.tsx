import { useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileDirectoryIcon } from "@primer/octicons-react";
import {
  OPTISCALER_PROXY_DLLS,
  compareOptiScalerVersions,
  resolveOptiScalerSettings,
} from "@shared";

import {
  Button,
  CheckboxField,
  Link,
  SelectField,
  TextField,
} from "@renderer/components";
import { gameDetailsContext } from "@renderer/context";
import { useAppSelector, useToast } from "@renderer/hooks";
import { logger } from "@renderer/logger";
import type {
  GameOptiScalerStatus,
  LibraryGame,
  OptiScalerProxyDll,
} from "@types";

const WIKI_URL = "https://github.com/optiscaler/OptiScaler/wiki";

export function OptiScalerSettingsSection({
  game,
}: Readonly<{ game: LibraryGame }>) {
  const { t } = useTranslation("game_details");
  const { updateGame } = useContext(gameDetailsContext);
  const { showSuccessToast, showErrorToast } = useToast();
  const userPreferences = useAppSelector(
    (state) => state.userPreferences.value
  );
  const defaultProxyDll = resolveOptiScalerSettings(userPreferences).proxyDll;

  const [status, setStatus] = useState<GameOptiScalerStatus | null>(null);
  const [busy, setBusy] = useState<"install" | "uninstall" | null>(null);
  const [cachedVersions, setCachedVersions] = useState<string[]>([]);
  const [version, setVersion] = useState("");

  useEffect(() => {
    window.electron
      .getOptiScalerOverview()
      .then((overview) => setCachedVersions(overview.cachedVersions))
      .catch(() => setCachedVersions([]));
  }, []);

  const refresh = useCallback(() => {
    window.electron
      .getGameOptiScalerStatus(game.shop, game.objectId)
      .then(setStatus)
      .catch((error) =>
        logger.error("Failed to load OptiScaler status", error)
      );
  }, [game.shop, game.objectId]);

  useEffect(() => {
    refresh();
  }, [refresh, game.executablePath]);

  const install = async () => {
    setBusy("install");
    const result = await window.electron.installGameOptiScaler(
      game.shop,
      game.objectId,
      version || undefined
    );
    setBusy(null);

    if (result.ok) {
      showSuccessToast(
        t("optiscaler_installed_toast", {
          version: result.installation.version,
        })
      );
    } else {
      showErrorToast(
        result.error === "external-install"
          ? t("optiscaler_external_install")
          : t("optiscaler_install_failed", { message: result.message })
      );
    }

    refresh();
    await updateGame();
  };

  const uninstall = async () => {
    setBusy("uninstall");
    try {
      await window.electron.uninstallGameOptiScaler(game.shop, game.objectId);
      showSuccessToast(t("optiscaler_uninstalled_toast"));
    } catch (error) {
      logger.error("Failed to remove OptiScaler", error);
      showErrorToast(t("optiscaler_uninstall_failed"));
    } finally {
      setBusy(null);
      refresh();
      await updateGame();
    }
  };

  const changeProxyDll = async (value: string) => {
    await window.electron.setGameOptiScalerProxyDll(
      game.shop,
      game.objectId,
      value ? (value as OptiScalerProxyDll) : null
    );
    await updateGame();
  };

  const toggleAutoInstall = async () => {
    await window.electron.setGameOptiScalerAutoInstallDisabled(
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
          <h2>OptiScaler</h2>
          <h4 className="game-options-modal__header-description">
            {t("optiscaler_windows_only")}
          </h4>
        </div>
      </div>
    );
  }

  const { installation, eligibility } = status;
  const updateAvailable =
    !!installation &&
    !!status.latestVersion &&
    compareOptiScalerVersions(installation.version, status.latestVersion) < 0;
  const configuredProxyDll = game.optiScalerProxyDll ?? defaultProxyDll;
  const proxyDllPendingReinstall =
    !!installation && installation.proxyDll !== configuredProxyDll;

  const statusText = status.externallyManaged
    ? t("optiscaler_status_external")
    : installation
      ? t("optiscaler_status_installed", {
          version: installation.version,
          proxyDll: installation.proxyDll,
        })
      : t("optiscaler_status_not_installed");

  return (
    <>
      <div className="game-options-modal__section">
        <div className="game-options-modal__header">
          <h2>OptiScaler</h2>
          <h4 className="game-options-modal__header-description">
            {statusText}
            {updateAvailable &&
              ` ${t("optiscaler_update_available", {
                version: status.latestVersion,
              })}`}
          </h4>
        </div>

        <TextField
          label={t("optiscaler_install_directory")}
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

        {!status.externallyManaged && cachedVersions.length > 0 && (
          <SelectField
            label={t("optiscaler_version")}
            value={version}
            theme="dark"
            options={[
              {
                key: "latest",
                value: "",
                label: t("optiscaler_version_latest", {
                  version: status.latestVersion ?? "-",
                }),
              },
              ...[...cachedVersions].reverse().map((item) => ({
                key: item,
                value: item,
                label: item,
              })),
            ]}
            onChange={(event) => setVersion(event.target.value)}
          />
        )}

        <div className="game-options-modal__row">
          {!status.externallyManaged && (
            <Button
              type="button"
              theme="outline"
              disabled={busy !== null}
              onClick={install}
            >
              {busy === "install"
                ? t("optiscaler_installing")
                : version
                  ? t("optiscaler_install_version", { version })
                  : installation
                    ? updateAvailable
                      ? t("optiscaler_update")
                      : t("optiscaler_reinstall")
                    : t("optiscaler_install")}
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
                ? t("optiscaler_uninstalling")
                : t("optiscaler_uninstall")}
            </Button>
          )}
        </div>
      </div>

      <div className="game-options-modal__section">
        <div className="game-options-modal__header">
          <h2>{t("optiscaler_support")}</h2>
        </div>

        <div className="game-options-modal__optiscaler-facts">
          {eligibility?.blocked && (
            <p className="game-options-modal__optiscaler-warning">
              {t("optiscaler_blocked", {
                notes: eligibility.compatibility?.notes || "-",
              })}
            </p>
          )}
          <p>
            {eligibility?.upscalerLibraries.length
              ? t("optiscaler_ships_upscalers", {
                  libraries: eligibility.upscalerLibraries
                    .map((library) => library.split(/[\\/]/).pop())
                    .filter((name, index, all) => all.indexOf(name) === index)
                    .join(", "),
                })
              : t("optiscaler_no_upscalers")}
          </p>
          {eligibility?.compatibility && !eligibility.blocked && (
            <p>
              {t("optiscaler_compatibility_entry", {
                inputs: eligibility.compatibility.upscalerInputs || "-",
              })}{" "}
              {eligibility.compatibility.optiPatcherSupported &&
                t("optiscaler_optipatcher_supported")}{" "}
              {eligibility.compatibility.notes}{" "}
              {eligibility.compatibility.wikiSlug && (
                <Link to={`${WIKI_URL}/${eligibility.compatibility.wikiSlug}`}>
                  {t("optiscaler_wiki_entry")}
                </Link>
              )}
            </p>
          )}
          {!eligibility?.compatibility && (
            <p>{t("optiscaler_not_on_compatibility_list")}</p>
          )}
        </div>
      </div>

      <div className="game-options-modal__section">
        <div className="game-options-modal__header">
          <h2>{t("optiscaler_options")}</h2>
        </div>

        <SelectField
          label={t("optiscaler_proxy_dll")}
          theme="dark"
          value={game.optiScalerProxyDll ?? ""}
          options={[
            {
              key: "default",
              value: "",
              label: t("optiscaler_proxy_dll_default", {
                proxyDll: defaultProxyDll,
              }),
            },
            ...OPTISCALER_PROXY_DLLS.map((proxyDll) => ({
              key: proxyDll,
              value: proxyDll,
              label: proxyDll,
            })),
          ]}
          onChange={(event) => changeProxyDll(event.target.value)}
        />
        {proxyDllPendingReinstall && (
          <p className="game-options-modal__optiscaler-hint">
            {t("optiscaler_proxy_dll_reinstall")}
          </p>
        )}

        <CheckboxField
          label={t("optiscaler_disable_auto_install")}
          checked={status.autoInstallDisabled}
          onChange={toggleAutoInstall}
        />
      </div>
    </>
  );
}
