import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { debounce } from "lodash-es";
import { Trans, useTranslation } from "react-i18next";
import { DownloadIcon, SyncIcon, TrashIcon } from "@primer/octicons-react";
import {
  OPTISCALER_PROXY_DLLS,
  formatBytes,
  parseIniOverrides,
  resolveOptiScalerSettings,
} from "@shared";

import { Button, CheckboxField, Link, SelectField } from "@renderer/components";
import { settingsContext } from "@renderer/context";
import { useAppSelector, useDate, useToast } from "@renderer/hooks";
import { logger } from "@renderer/logger";
import type {
  OptiScalerBulkProgress,
  OptiScalerChannel,
  OptiScalerOverview,
  OptiScalerProxyDll,
} from "@types";

import "./settings-optiscaler.scss";

const OPTISCALER_REPOSITORY_URL = "https://github.com/optiscaler/OptiScaler";
const OPTISCALER_COMPATIBILITY_URL =
  "https://github.com/optiscaler/OptiScaler/wiki/Compatibility-List";
const OPTIPATCHER_URL = "https://github.com/optiscaler/OptiPatcher";

export function SettingsContextOptiScaler() {
  const { t } = useTranslation("settings");
  const { formatDistance } = useDate();
  const { showSuccessToast, showErrorToast } = useToast();
  const { updateUserPreferences } = useContext(settingsContext);
  const updateUserPreferencesRef = useRef(updateUserPreferences);
  updateUserPreferencesRef.current = updateUserPreferences;

  const userPreferences = useAppSelector(
    (state) => state.userPreferences.value
  );
  const settings = resolveOptiScalerSettings(userPreferences);

  const [iniOverrides, setIniOverrides] = useState(
    () => userPreferences?.optiScalerIniOverrides ?? ""
  );
  const [overview, setOverview] = useState<OptiScalerOverview | null>(null);
  const [busyAction, setBusyAction] = useState<
    "check" | "download" | "clear" | null
  >(null);
  const [bulkProgress, setBulkProgress] =
    useState<OptiScalerBulkProgress | null>(null);

  const invalidIniLines = useMemo(
    () => parseIniOverrides(iniOverrides).invalidLines,
    [iniOverrides]
  );

  const refreshOverview = useCallback(() => {
    window.electron
      .getOptiScalerOverview()
      .then(setOverview)
      .catch((error) => logger.error("Failed to load OptiScaler state", error));
  }, []);

  useEffect(() => {
    refreshOverview();
  }, [refreshOverview, settings.channel]);

  useEffect(
    () =>
      window.electron.onOptiScalerBulkProgress((progress) => {
        setBulkProgress(progress);
        if (progress.status === "completed") refreshOverview();
      }),
    [refreshOverview]
  );

  const saveIniOverrides = useMemo(
    () =>
      debounce((value: string) => {
        updateUserPreferencesRef.current({ optiScalerIniOverrides: value });
      }, 500),
    []
  );

  useEffect(() => () => saveIniOverrides.flush(), [saveIniOverrides]);

  const runAction = async (
    action: "check" | "download" | "clear",
    task: () => Promise<unknown>,
    successMessage: string
  ) => {
    setBusyAction(action);
    try {
      await task();
      showSuccessToast(successMessage);
    } catch (error) {
      logger.error(`OptiScaler ${action} failed`, error);
      showErrorToast(t("optiscaler_action_failed"));
    } finally {
      setBusyAction(null);
      refreshOverview();
    }
  };

  const startBulk = async (mode: "install-eligible" | "update-installed") => {
    const started = await window.electron.runOptiScalerBulk(mode);
    if (!started) showErrorToast(t("optiscaler_bulk_already_running"));
  };

  const isBulkRunning = bulkProgress?.status === "running";
  const downloadedLatest =
    !!overview?.latestVersion &&
    overview.cachedVersions.includes(overview.latestVersion);

  return (
    <div className="settings-context-panel settings-optiscaler">
      <div className="settings-context-panel__group">
        <p className="settings-optiscaler__muted">
          <Trans
            i18nKey="optiscaler_description"
            ns="settings"
            components={{
              repository: <Link to={OPTISCALER_REPOSITORY_URL} />,
            }}
          />
        </p>
        {window.electron.platform === "linux" && (
          <p className="settings-optiscaler__muted">
            <Trans
              i18nKey="optiscaler_linux_description"
              ns="settings"
              components={{ code: <code /> }}
            />
          </p>
        )}
      </div>

      <div className="settings-context-panel__group">
        <h3>{t("optiscaler_automatic_installation")}</h3>
        <CheckboxField
          label={t("optiscaler_auto_install")}
          checked={settings.autoInstall}
          onChange={() =>
            updateUserPreferences({
              optiScalerAutoInstall: !settings.autoInstall,
            })
          }
        />
        <p className="settings-optiscaler__muted">
          {t("optiscaler_auto_install_description")}
        </p>

        <div className="settings-optiscaler__nested">
          <CheckboxField
            label={t("optiscaler_detect_native_upscalers")}
            checked={settings.detectNativeUpscalers}
            onChange={() =>
              updateUserPreferences({
                optiScalerDetectNativeUpscalers:
                  !settings.detectNativeUpscalers,
              })
            }
          />
          <CheckboxField
            label={t("optiscaler_use_compatibility_list")}
            checked={settings.useCompatibilityList}
            onChange={() =>
              updateUserPreferences({
                optiScalerUseCompatibilityList: !settings.useCompatibilityList,
              })
            }
          />
          <p className="settings-optiscaler__muted">
            <Trans
              i18nKey="optiscaler_compatibility_list_description"
              ns="settings"
              values={{ count: overview?.compatibilityListSize ?? 0 }}
              components={{
                wiki: <Link to={OPTISCALER_COMPATIBILITY_URL} />,
              }}
            />
          </p>
          <CheckboxField
            label={t("optiscaler_install_optipatcher")}
            checked={settings.installOptiPatcher}
            onChange={() =>
              updateUserPreferences({
                optiScalerInstallOptiPatcher: !settings.installOptiPatcher,
              })
            }
          />
          <p className="settings-optiscaler__muted">
            <Trans
              i18nKey="optiscaler_optipatcher_description"
              ns="settings"
              components={{ optipatcher: <Link to={OPTIPATCHER_URL} /> }}
            />
          </p>
        </div>
      </div>

      <div className="settings-context-panel__group">
        <h3>{t("optiscaler_version")}</h3>
        <SelectField
          label={t("optiscaler_channel")}
          value={settings.channel}
          theme="dark"
          options={(["stable", "nightly"] as OptiScalerChannel[]).map(
            (channel) => ({
              key: channel,
              value: channel,
              label: t(`optiscaler_channel_${channel}`),
            })
          )}
          onChange={(event) =>
            updateUserPreferences({
              optiScalerChannel: event.target.value as OptiScalerChannel,
            })
          }
        />
        <p className="settings-optiscaler__muted">
          {overview?.latestVersion
            ? t("optiscaler_latest_version", {
                version: overview.latestVersion,
                checked: overview.lastCheckedAt
                  ? formatDistance(overview.lastCheckedAt, new Date(), {
                      addSuffix: true,
                    })
                  : "-",
              })
            : t("optiscaler_latest_version_unknown")}{" "}
          {downloadedLatest
            ? t("optiscaler_downloaded")
            : t("optiscaler_not_downloaded")}
        </p>
        <div className="settings-optiscaler__actions">
          <Button
            type="button"
            theme="outline"
            disabled={busyAction !== null}
            onClick={() =>
              runAction(
                "check",
                () => window.electron.checkOptiScalerUpdates(),
                t("optiscaler_checked_for_updates")
              )
            }
          >
            <SyncIcon size={14} />
            {t("optiscaler_check_for_updates")}
          </Button>
          <Button
            type="button"
            theme="outline"
            disabled={busyAction !== null || downloadedLatest}
            onClick={() =>
              runAction(
                "download",
                () => window.electron.downloadOptiScaler(),
                t("optiscaler_downloaded_toast")
              )
            }
          >
            <DownloadIcon size={14} />
            {busyAction === "download"
              ? t("optiscaler_downloading")
              : t("optiscaler_download_now")}
          </Button>
          <Button
            type="button"
            theme="outline"
            disabled={busyAction !== null || !overview?.cacheSizeInBytes}
            onClick={() =>
              runAction(
                "clear",
                () => window.electron.clearOptiScalerCache(),
                t("optiscaler_cache_cleared")
              )
            }
          >
            <TrashIcon size={14} />
            {t("optiscaler_clear_cache", {
              size: formatBytes(overview?.cacheSizeInBytes ?? 0),
            })}
          </Button>
        </div>
      </div>

      <div className="settings-context-panel__group">
        <h3>{t("optiscaler_injection")}</h3>
        <SelectField
          label={t("optiscaler_proxy_dll")}
          value={settings.proxyDll}
          theme="dark"
          options={OPTISCALER_PROXY_DLLS.map((proxyDll) => ({
            key: proxyDll,
            value: proxyDll,
            label: proxyDll,
          }))}
          onChange={(event) =>
            updateUserPreferences({
              optiScalerProxyDll: event.target.value as OptiScalerProxyDll,
            })
          }
        />
        <p className="settings-optiscaler__muted">
          {t("optiscaler_proxy_dll_description")}
        </p>
      </div>

      <div className="settings-context-panel__group">
        <h3>{t("optiscaler_ini_overrides")}</h3>
        <p className="settings-optiscaler__muted">
          <Trans
            i18nKey="optiscaler_ini_overrides_description"
            ns="settings"
            components={{ code: <code /> }}
          />
        </p>
        <textarea
          className="settings-optiscaler__textarea"
          value={iniOverrides}
          rows={6}
          spellCheck={false}
          placeholder={"[Menu]\nShortcutKey=0x78"}
          onChange={(event) => {
            setIniOverrides(event.target.value);
            saveIniOverrides(event.target.value);
          }}
        />
        {invalidIniLines.length > 0 && (
          <p className="settings-optiscaler__error">
            {t("optiscaler_ini_overrides_invalid", {
              lines: invalidIniLines.join(", "),
            })}
          </p>
        )}
      </div>

      <div className="settings-context-panel__group">
        <h3>{t("optiscaler_library")}</h3>
        <p className="settings-optiscaler__muted">
          {t("optiscaler_installed_games", {
            count: overview?.installedGames ?? 0,
          })}
          {overview?.outdatedGames
            ? ` ${t("optiscaler_outdated_games", {
                count: overview.outdatedGames,
              })}`
            : ""}
        </p>
        {bulkProgress && (
          <p className="settings-optiscaler__muted">
            {isBulkRunning
              ? t("optiscaler_bulk_running", {
                  processed: bulkProgress.processed,
                  total: bulkProgress.total,
                })
              : t("optiscaler_bulk_completed", {
                  installed: bulkProgress.installed,
                  failed: bulkProgress.failed,
                })}
          </p>
        )}
        <div className="settings-optiscaler__actions">
          <Button
            type="button"
            theme="outline"
            disabled={isBulkRunning}
            onClick={() => startBulk("install-eligible")}
          >
            {t("optiscaler_install_in_eligible_games")}
          </Button>
          {!!overview?.outdatedGames && (
            <Button
              type="button"
              theme="outline"
              disabled={isBulkRunning}
              onClick={() => startBulk("update-installed")}
            >
              {t("optiscaler_update_installed_games", {
                count: overview.outdatedGames,
              })}
            </Button>
          )}
        </div>
        <p className="settings-optiscaler__muted">
          {t("optiscaler_per_game_hint")}
        </p>
      </div>
    </div>
  );
}
