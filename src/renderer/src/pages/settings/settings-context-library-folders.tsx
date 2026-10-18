import { useContext } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { FileDirectoryIcon, SyncIcon, XIcon } from "@primer/octicons-react";

import { Button, CheckboxField } from "@renderer/components";
import { settingsContext } from "@renderer/context";
import { useAppSelector } from "@renderer/hooks";

import "./settings-library-folders.scss";

export function SettingsContextLibraryFolders() {
  const { t } = useTranslation("settings");
  const navigate = useNavigate();
  const { updateUserPreferences } = useContext(settingsContext);

  const userPreferences = useAppSelector(
    (state) => state.userPreferences.value
  );

  const folders = userPreferences?.libraryScanDirectories ?? [];
  const ignoredFolders = userPreferences?.libraryScanIgnoredFolders ?? [];
  const scanOnStartup = userPreferences?.scanLibraryOnStartup === true;
  const identifyByFolderName =
    userPreferences?.identifyGamesByFolderName !== false;

  const handleAddFolders = async () => {
    const { canceled, filePaths } = await window.electron.showOpenDialog({
      properties: ["openDirectory", "multiSelections"],
    });

    if (canceled || filePaths.length === 0) return;

    await updateUserPreferences({
      libraryScanDirectories: [
        ...folders,
        ...filePaths.filter((filePath) => !folders.includes(filePath)),
      ],
    });
  };

  const handleRemoveFolder = (folder: string) =>
    updateUserPreferences({
      libraryScanDirectories: folders.filter((item) => item !== folder),
    });

  return (
    <div className="settings-context-panel settings-library-folders">
      <div className="settings-context-panel__group">
        <p className="settings-library-folders__description">
          {t("library_folders_description")}
        </p>

        <div className="settings-library-folders__header">
          <h3>{t("library_folders_list")}</h3>
          <Button type="button" theme="outline" onClick={handleAddFolders}>
            <FileDirectoryIcon size={14} />
            {t("library_folders_add")}
          </Button>
        </div>

        {folders.length > 0 ? (
          <ul className="settings-library-folders__list">
            {folders.map((folder) => (
              <li key={folder} className="settings-library-folders__item">
                <span className="settings-library-folders__path">{folder}</span>
                <button
                  type="button"
                  className="settings-library-folders__remove"
                  onClick={() => handleRemoveFolder(folder)}
                  aria-label={t("library_folders_remove")}
                >
                  <XIcon size={14} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="settings-library-folders__empty">
            {t("library_folders_empty")}
          </p>
        )}

        <p className="settings-library-folders__hint">
          {t("library_folders_always_included")}
        </p>
      </div>

      <div className="settings-context-panel__group">
        <CheckboxField
          label={t("library_folders_scan_on_startup")}
          checked={scanOnStartup}
          onChange={() =>
            updateUserPreferences({ scanLibraryOnStartup: !scanOnStartup })
          }
        />

        <CheckboxField
          label={t("library_folders_identify_by_name")}
          checked={identifyByFolderName}
          onChange={() =>
            updateUserPreferences({
              identifyGamesByFolderName: !identifyByFolderName,
            })
          }
        />
        <p className="settings-library-folders__hint">
          {t("library_folders_identify_by_name_description")}
        </p>
      </div>

      {ignoredFolders.length > 0 && (
        <div className="settings-context-panel__group">
          <h3>{t("library_folders_ignored")}</h3>
          <p className="settings-library-folders__hint">
            {t("library_folders_ignored_description")}
          </p>
          <ul className="settings-library-folders__list">
            {ignoredFolders.map((folder) => (
              <li key={folder} className="settings-library-folders__item">
                <span className="settings-library-folders__path">{folder}</span>
                <button
                  type="button"
                  className="settings-library-folders__remove"
                  onClick={() =>
                    updateUserPreferences({
                      libraryScanIgnoredFolders: ignoredFolders.filter(
                        (item) => item !== folder
                      ),
                    })
                  }
                  aria-label={t("library_folders_unignore")}
                  title={t("library_folders_unignore")}
                >
                  <XIcon size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="settings-library-folders__actions">
        <Button
          type="button"
          theme="outline"
          onClick={() => navigate("/library?openScanModal=true")}
        >
          <SyncIcon size={14} />
          {t("library_folders_scan_now")}
        </Button>
      </div>
    </div>
  );
}
