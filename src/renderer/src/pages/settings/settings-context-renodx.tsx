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
import { SyncIcon, TrashIcon } from "@primer/octicons-react";
import {
  DEFAULT_RESHADE_INI_OVERRIDES,
  formatBytes,
  parseIniOverrides,
  resolveRenoDxSettings,
} from "@shared";

import { Button, CheckboxField, Link } from "@renderer/components";
import { settingsContext } from "@renderer/context";
import { useAppSelector, useDate, useToast } from "@renderer/hooks";
import { logger } from "@renderer/logger";
import type {
  RenoDxBulkMode,
  RenoDxBulkProgress,
  RenoDxOverview,
} from "@types";

// The INI field and notes look the same as OptiScaler's, so they share its styles.
import "./settings-optiscaler.scss";

const RENODX_REPOSITORY_URL = "https://github.com/clshortfuse/renodx";
const RESHADE_URL = "https://reshade.me";

export function SettingsContextRenoDx() {
  const { t } = useTranslation("settings");
  const { formatDistance } = useDate();
  const { showSuccessToast, showErrorToast } = useToast();
  const { updateUserPreferences } = useContext(settingsContext);
  const updateUserPreferencesRef = useRef(updateUserPreferences);
  updateUserPreferencesRef.current = updateUserPreferences;

  const userPreferences = useAppSelector(
    (state) => state.userPreferences.value
  );
  const settings = resolveRenoDxSettings(userPreferences);

  const [iniOverrides, setIniOverrides] = useState(
    () => userPreferences?.reShadeIniOverrides ?? DEFAULT_RESHADE_INI_OVERRIDES
  );
  const [overview, setOverview] = useState<RenoDxOverview | null>(null);
  const [busyAction, setBusyAction] = useState<"check" | "clear" | null>(null);
  const [bulkProgress, setBulkProgress] = useState<RenoDxBulkProgress | null>(
    null
  );

  const invalidIniLines = useMemo(
    () => parseIniOverrides(iniOverrides).invalidLines,
    [iniOverrides]
  );

  const refreshOverview = useCallback(() => {
    window.electron
      .getRenoDxOverview()
      .then(setOverview)
      .catch((error) => logger.error("Failed to load RenoDX state", error));
  }, []);

  useEffect(() => {
    refreshOverview();
  }, [refreshOverview]);

  useEffect(
    () =>
      window.electron.onRenoDxBulkProgress((progress) => {
        setBulkProgress(progress);
        if (progress.status === "completed") refreshOverview();
      }),
    [refreshOverview]
  );

  const saveIniOverrides = useMemo(
    () =>
      debounce((value: string) => {
        updateUserPreferencesRef.current({ reShadeIniOverrides: value });
      }, 500),
    []
  );

  useEffect(() => () => saveIniOverrides.flush(), [saveIniOverrides]);

  const changeIniOverrides = (value: string) => {
    setIniOverrides(value);
    saveIniOverrides(value);
  };

  const runAction = async (
    action: "check" | "clear",
    task: () => Promise<unknown>,
    successMessage: string
  ) => {
    setBusyAction(action);
    try {
      await task();
      showSuccessToast(successMessage);
    } catch (error) {
      logger.error(`RenoDX ${action} failed`, error);
      showErrorToast(t("renodx_action_failed"));
    } finally {
      setBusyAction(null);
      refreshOverview();
    }
  };

  const startBulk = async (mode: RenoDxBulkMode) => {
    const started = await window.electron.runRenoDxBulk(mode);
    if (!started) showErrorToast(t("renodx_bulk_already_running"));
  };

  const isBulkRunning = bulkProgress?.status === "running";

  return (
    <div className="settings-context-panel settings-optiscaler">
      <div className="settings-context-panel__group">
        <p className="settings-optiscaler__muted">
          <Trans
            i18nKey="renodx_description"
            ns="settings"
            components={{
              renodx: <Link to={RENODX_REPOSITORY_URL} />,
              reshade: <Link to={RESHADE_URL} />,
            }}
          />
        </p>
      </div>

      <div className="settings-context-panel__group">
        <h3>{t("renodx_automatic_installation")}</h3>
        <CheckboxField
          label={t("renodx_auto_install")}
          checked={settings.autoInstall}
          onChange={() =>
            updateUserPreferences({ renoDxAutoInstall: !settings.autoInstall })
          }
        />
        <p className="settings-optiscaler__muted">
          {t("renodx_auto_install_description")}
        </p>

        <div className="settings-optiscaler__nested">
          <CheckboxField
            label={t("renodx_include_prerelease")}
            checked={settings.includePrerelease}
            onChange={() =>
              updateUserPreferences({
                renoDxIncludePrerelease: !settings.includePrerelease,
              })
            }
          />
          <p className="settings-optiscaler__muted">
            {t("renodx_include_prerelease_description")}
          </p>
          <CheckboxField
            label={t("renodx_enable_hdr_rules")}
            checked={settings.enableHdrRules}
            onChange={() =>
              updateUserPreferences({
                renoDxEnableHdrRules: !settings.enableHdrRules,
              })
            }
          />
          <p className="settings-optiscaler__muted">
            {t("renodx_enable_hdr_rules_description")}
          </p>
        </div>
      </div>

      <div className="settings-context-panel__group">
        <h3>{t("renodx_reshade_settings")}</h3>
        <p className="settings-optiscaler__muted">
          <Trans
            i18nKey="renodx_reshade_settings_description"
            ns="settings"
            components={{ code: <code /> }}
          />
        </p>
        <textarea
          className="settings-optiscaler__textarea"
          value={iniOverrides}
          rows={4}
          spellCheck={false}
          placeholder={DEFAULT_RESHADE_INI_OVERRIDES}
          onChange={(event) => changeIniOverrides(event.target.value)}
        />
        {invalidIniLines.length > 0 && (
          <p className="settings-optiscaler__error">
            {t("renodx_reshade_settings_invalid", {
              lines: invalidIniLines.join(", "),
            })}
          </p>
        )}
        <div className="settings-optiscaler__actions">
          <Button
            type="button"
            theme="outline"
            disabled={iniOverrides === DEFAULT_RESHADE_INI_OVERRIDES}
            onClick={() => changeIniOverrides(DEFAULT_RESHADE_INI_OVERRIDES)}
          >
            {t("renodx_reshade_settings_restore")}
          </Button>
        </div>
      </div>

      <div className="settings-context-panel__group">
        <h3>{t("renodx_catalogue")}</h3>
        <p className="settings-optiscaler__muted">
          {overview?.catalogueUpdatedAt
            ? t("renodx_catalogue_games", {
                count: overview.catalogueGames,
                checked: formatDistance(
                  overview.catalogueUpdatedAt,
                  new Date(),
                  { addSuffix: true }
                ),
              })
            : t("renodx_catalogue_unknown")}{" "}
          {overview?.latestReShadeVersion
            ? t("renodx_latest_reshade", {
                version: overview.latestReShadeVersion,
              })
            : t("renodx_latest_reshade_unknown")}
        </p>
        <div className="settings-optiscaler__actions">
          <Button
            type="button"
            theme="outline"
            disabled={busyAction !== null}
            onClick={() =>
              runAction(
                "check",
                () => window.electron.checkRenoDxUpdates(),
                t("renodx_checked_for_updates")
              )
            }
          >
            <SyncIcon size={14} />
            {t("renodx_check_for_updates")}
          </Button>
          <Button
            type="button"
            theme="outline"
            disabled={busyAction !== null || !overview?.cacheSizeInBytes}
            onClick={() =>
              runAction(
                "clear",
                () => window.electron.clearRenoDxCache(),
                t("renodx_cache_cleared")
              )
            }
          >
            <TrashIcon size={14} />
            {t("renodx_clear_cache", {
              size: formatBytes(overview?.cacheSizeInBytes ?? 0),
            })}
          </Button>
        </div>
      </div>

      <div className="settings-context-panel__group">
        <h3>{t("renodx_library")}</h3>
        <p className="settings-optiscaler__muted">
          {t("renodx_installed_games", {
            count: overview?.installedGames ?? 0,
          })}
          {overview?.outdatedGames
            ? ` ${t("renodx_outdated_games", {
                count: overview.outdatedGames,
              })}`
            : ""}
        </p>
        {bulkProgress && (
          <p className="settings-optiscaler__muted">
            {isBulkRunning
              ? t("renodx_bulk_running", {
                  processed: bulkProgress.processed,
                  total: bulkProgress.total,
                })
              : t("renodx_bulk_completed", {
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
            onClick={() => startBulk("install-supported")}
          >
            {t("renodx_install_in_supported_games")}
          </Button>
          {!!overview?.installedGames && (
            <Button
              type="button"
              theme="outline"
              disabled={isBulkRunning}
              onClick={() => startBulk("update-installed")}
            >
              {t("renodx_update_installed_games", {
                count: overview.installedGames,
              })}
            </Button>
          )}
        </div>
        <p className="settings-optiscaler__muted">
          {t("renodx_per_game_hint")}
        </p>
      </div>
    </div>
  );
}
