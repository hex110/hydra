import { useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileDirectoryIcon, TrashIcon } from "@primer/octicons-react";

import { Button, TextField } from "@renderer/components";
import { settingsContext } from "@renderer/context";
import { useAppSelector, useToast } from "@renderer/hooks";
import { formatBytes } from "@shared";
import type { GameSaveBackups } from "@types";

import "./settings-save-import.scss";

export function SettingsSaveBackups() {
  const { t } = useTranslation("settings");
  const { updateUserPreferences } = useContext(settingsContext);
  const { showSuccessToast } = useToast();
  const userPreferences = useAppSelector(
    (state) => state.userPreferences.value
  );

  const [backups, setBackups] = useState<GameSaveBackups[] | null>(null);
  const [keep, setKeep] = useState("");

  useEffect(() => {
    setKeep(
      userPreferences?.saveBackupsToKeep
        ? String(userPreferences.saveBackupsToKeep)
        : ""
    );
  }, [userPreferences?.saveBackupsToKeep]);

  const refresh = useCallback(() => {
    window.electron.listSaveBackups().then(setBackups);
  }, []);

  useEffect(refresh, [refresh]);

  const handleKeepBlur = () => {
    const parsed = Number.parseInt(keep, 10);
    const value = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    setKeep(value ? String(value) : "");
    updateUserPreferences({ saveBackupsToKeep: value });
  };

  const handlePrune = async () => {
    const removed = await window.electron.pruneSaveBackups();
    showSuccessToast(t("save_backups_pruned", { count: removed }));
    refresh();
  };

  const handleDelete = async (backup: GameSaveBackups) => {
    await window.electron.deleteGameSaveBackups(backup.shop, backup.objectId);
    refresh();
  };

  const totalSize = (backups ?? []).reduce(
    (sum, backup) => sum + backup.sizeInBytes,
    0
  );

  return (
    <div className="settings-context-panel__group">
      <h3>{t("save_backups")}</h3>
      <p className="settings-save-import__muted">
        {t("save_backups_description")}
      </p>

      <TextField
        type="number"
        min="1"
        label={t("save_backups_keep")}
        hint={t("save_backups_keep_hint")}
        placeholder={t("save_backups_keep_all")}
        value={keep}
        onChange={(event) => setKeep(event.target.value)}
        onBlur={handleKeepBlur}
      />

      {backups && backups.length > 0 ? (
        <>
          <p className="settings-save-import__muted">
            {t("save_backups_total", {
              count: backups.length,
              size: formatBytes(totalSize),
            })}
          </p>
          <ul className="settings-save-import__list">
            {backups.map((backup) => (
              <li
                key={`${backup.shop}-${backup.objectId}`}
                className="settings-save-import__item"
              >
                <span>
                  {backup.title}
                  <span className="settings-save-import__muted">
                    {" · "}
                    {t("save_backups_game", {
                      count: backup.count,
                      size: formatBytes(backup.sizeInBytes),
                    })}
                  </span>
                </span>
                <span className="settings-save-import__actions">
                  <button
                    type="button"
                    className="settings-save-import__remove"
                    onClick={() =>
                      window.electron.openGameSaveBackups(
                        backup.shop,
                        backup.objectId
                      )
                    }
                    aria-label={t("save_backups_open")}
                    title={t("save_backups_open")}
                  >
                    <FileDirectoryIcon size={14} />
                  </button>
                  <button
                    type="button"
                    className="settings-save-import__remove"
                    onClick={() => handleDelete(backup)}
                    aria-label={t("save_backups_delete")}
                    title={t("save_backups_delete")}
                  >
                    <TrashIcon size={14} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
          {userPreferences?.saveBackupsToKeep ? (
            <div className="settings-save-import__actions">
              <Button type="button" theme="outline" onClick={handlePrune}>
                {t("save_backups_prune")}
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <p className="settings-save-import__muted">
          {backups ? t("save_backups_none") : t("save_import_loading")}
        </p>
      )}
    </div>
  );
}
