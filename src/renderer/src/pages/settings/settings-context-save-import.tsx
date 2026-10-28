import { useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileDirectoryIcon, XIcon } from "@primer/octicons-react";

import { Button, CheckboxField, SelectField } from "@renderer/components";
import { settingsContext } from "@renderer/context";
import { useAppSelector, useToast } from "@renderer/hooks";
import type {
  SaveImportBulkProgress,
  SaveImportMode,
  SaveImportSourceInfo,
} from "@types";

import { SettingsSaveBackups } from "./settings-save-backups";
import "./settings-save-import.scss";

const SAVE_IMPORT_MODES: SaveImportMode[] = ["ask", "automatic", "never"];

export function SettingsContextSaveImport() {
  const { t } = useTranslation("settings");
  const { updateUserPreferences } = useContext(settingsContext);
  const { showErrorToast } = useToast();

  const userPreferences = useAppSelector(
    (state) => state.userPreferences.value
  );
  const mode = userPreferences?.saveImportMode ?? "ask";
  const customSources = userPreferences?.saveImportCustomSources ?? [];
  const disabledSources = userPreferences?.saveImportDisabledSources ?? [];

  const [sources, setSources] = useState<SaveImportSourceInfo[] | null>(null);
  const [bulkProgress, setBulkProgress] =
    useState<SaveImportBulkProgress | null>(null);

  const refreshSources = useCallback(() => {
    window.electron.listSaveImportSources().then(setSources);
  }, []);

  useEffect(() => {
    refreshSources();
  }, [refreshSources, userPreferences?.saveImportCustomSources]);

  useEffect(
    () => window.electron.onSaveImportBulkProgress(setBulkProgress),
    []
  );

  const toggleSource = (source: SaveImportSourceInfo) => {
    const disabled = source.enabled
      ? [...disabledSources, source.id]
      : disabledSources.filter((id) => id !== source.id);
    setSources(
      (current) =>
        current?.map((item) =>
          item.id === source.id ? { ...item, enabled: !item.enabled } : item
        ) ?? null
    );
    updateUserPreferences({ saveImportDisabledSources: disabled });
  };

  const handleAddFolder = async () => {
    const { canceled, filePaths } = await window.electron.showOpenDialog({
      properties: ["openDirectory"],
    });
    if (canceled || filePaths.length === 0) return;

    const [rootPath] = filePaths;
    const profiles = await window.electron.inspectSaveImportFolder(rootPath);
    if (!profiles) {
      showErrorToast(t("save_import_not_windows_folder"));
      return;
    }

    const added = profiles
      .map((userProfile) => ({ rootPath, userProfile }))
      .filter(
        (source) =>
          !customSources.some(
            (item) =>
              item.rootPath === source.rootPath &&
              item.userProfile === source.userProfile
          )
      );
    await updateUserPreferences({
      saveImportCustomSources: [...customSources, ...added],
    });
  };

  const handleRemoveSource = (source: SaveImportSourceInfo) =>
    updateUserPreferences({
      saveImportCustomSources: customSources.filter(
        (item) =>
          item.rootPath !== source.rootPath ||
          item.userProfile !== source.userProfile
      ),
    });

  const startBulk = async () => {
    const started = await window.electron.runSaveImportBulk();
    if (!started) showErrorToast(t("save_import_bulk_already_running"));
  };

  const isBulkRunning = bulkProgress?.status === "running";

  return (
    <div className="settings-context-panel settings-save-import">
      <div className="settings-context-panel__group">
        <p className="settings-save-import__muted">
          {t("save_import_description")}
        </p>

        <SelectField
          label={t("save_import_mode")}
          value={mode}
          theme="dark"
          options={SAVE_IMPORT_MODES.map((item) => ({
            key: item,
            value: item,
            label: t(`save_import_mode_${item}`),
          }))}
          onChange={(event) =>
            updateUserPreferences({
              saveImportMode: event.target.value as SaveImportMode,
            })
          }
        />
        <p className="settings-save-import__muted">
          {t(`save_import_mode_${mode}_description`)}
        </p>
      </div>

      <div className="settings-context-panel__group">
        <div className="settings-save-import__header">
          <h3>{t("save_import_sources")}</h3>
          <Button type="button" theme="outline" onClick={handleAddFolder}>
            <FileDirectoryIcon size={14} />
            {t("save_import_add_folder")}
          </Button>
        </div>

        {sources && sources.length > 0 ? (
          <ul className="settings-save-import__list">
            {sources.map((source) => (
              <li key={source.id} className="settings-save-import__item">
                <CheckboxField
                  label={source.label}
                  checked={source.enabled}
                  onChange={() => toggleSource(source)}
                />
                {source.detected ? (
                  <span className="settings-save-import__muted">
                    {t("save_import_detected")}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="settings-save-import__remove"
                    onClick={() => handleRemoveSource(source)}
                    aria-label={t("save_import_remove_source")}
                  >
                    <XIcon size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="settings-save-import__muted">
            {sources ? t("save_import_no_sources") : t("save_import_loading")}
          </p>
        )}

        <p className="settings-save-import__muted">
          {t("save_import_sources_hint")}
        </p>
      </div>

      <div className="settings-context-panel__group">
        <h3>{t("save_import_library")}</h3>
        <p className="settings-save-import__muted">
          {t("save_import_library_description")}
        </p>
        {bulkProgress && (
          <p className="settings-save-import__muted">
            {isBulkRunning
              ? t("save_import_bulk_running", {
                  processed: bulkProgress.processed,
                  total: bulkProgress.total,
                })
              : t("save_import_bulk_completed", {
                  imported: bulkProgress.importedGames,
                  failed: bulkProgress.failedGames,
                })}
          </p>
        )}
        <div className="settings-save-import__actions">
          <Button
            type="button"
            theme="outline"
            disabled={isBulkRunning || !sources?.some((item) => item.enabled)}
            onClick={startBulk}
          >
            {t("save_import_run_bulk")}
          </Button>
        </div>
        <p className="settings-save-import__muted">
          {t("save_import_backups_hint")}
        </p>
      </div>

      <SettingsSaveBackups />
    </div>
  );
}
