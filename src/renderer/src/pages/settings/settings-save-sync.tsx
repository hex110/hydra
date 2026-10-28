import { useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileDirectoryIcon, SyncIcon } from "@primer/octicons-react";
import { Button, SelectField, TextField } from "@renderer/components";
import { settingsContext } from "@renderer/context";
import { useAppSelector, useToast } from "@renderer/hooks";
import type { SaveStoreConfig } from "@types";

import { SettingsIntegrationCard } from "./settings-integration-card";

import "./settings-tracking.scss";
import "./settings-cloud.scss";

type TargetKind = SaveStoreConfig["kind"];

interface SettingsSaveSyncProps {
  onOpenR2Guide: () => void;
}

/** Self-hosted save sync: a folder or an rclone remote instead of Hydra Cloud. */
export function SettingsSaveSync({
  onOpenR2Guide,
}: Readonly<SettingsSaveSyncProps>) {
  const { t } = useTranslation("settings");
  const { updateUserPreferences } = useContext(settingsContext);
  const { showSuccessToast, showErrorToast } = useToast();
  const saveStore = useAppSelector(
    (state) => state.userPreferences.value?.saveStore ?? null
  );

  const [kind, setKind] = useState<TargetKind>("folder");
  const [folder, setFolder] = useState("");
  const [remote, setRemote] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [rcloneAvailable, setRcloneAvailable] = useState<boolean | null>(null);

  const checkRclone = useCallback(() => {
    window.electron
      .isRcloneAvailable()
      .then(setRcloneAvailable)
      .catch(() => setRcloneAvailable(false));
  }, []);

  useEffect(() => {
    checkRclone();
  }, [checkRclone]);

  const config: SaveStoreConfig =
    kind === "folder"
      ? { kind, path: folder.trim() }
      : { kind, remote: remote.trim() };
  const canTurnOn =
    !isBusy &&
    (kind === "folder"
      ? Boolean(folder.trim())
      : Boolean(remote.trim()) && rcloneAvailable === true);

  const chooseFolder = async () => {
    const { filePaths } = await window.electron.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
    });
    if (filePaths?.[0]) setFolder(filePaths[0]);
  };

  const turnOn = async () => {
    setIsBusy(true);
    try {
      await window.electron.testSaveStore(config);
      await updateUserPreferences({ saveStore: config });
      showSuccessToast(t("save_sync_enabled"));
    } catch {
      showErrorToast(t("save_sync_test_failed"));
    } finally {
      setIsBusy(false);
    }
  };

  const testConnection = async () => {
    if (!saveStore) return;
    setIsBusy(true);
    try {
      await window.electron.testSaveStore(saveStore);
      showSuccessToast(t("cloud_test_ok"));
    } catch {
      showErrorToast(t("save_sync_test_failed"));
    } finally {
      setIsBusy(false);
    }
  };

  const turnOff = async () => {
    await updateUserPreferences({ saveStore: null });
    showSuccessToast(t("save_sync_disabled"));
  };

  return (
    <SettingsIntegrationCard
      title={t("cloud_storage_title")}
      logo={<SyncIcon />}
      status={saveStore ? t("save_sync_on") : t("save_sync_off")}
      statusTone={saveStore ? "success" : "neutral"}
      actions={
        saveStore ? (
          <>
            {saveStore.kind === "rclone" && (
              <Button
                theme="outline"
                disabled={isBusy}
                onClick={() => void testConnection()}
              >
                {t("cloud_test_connection")}
              </Button>
            )}
            <Button theme="danger" onClick={() => void turnOff()}>
              {t("save_sync_turn_off")}
            </Button>
          </>
        ) : (
          <Button disabled={!canTurnOn} onClick={() => void turnOn()}>
            {t("save_sync_turn_on")}
          </Button>
        )
      }
    >
      {saveStore ? (
        <>
          <div className="settings-integration-card__account">
            <span className="settings-integration-card__username">
              {saveStore.kind === "folder"
                ? t("save_sync_active_folder", { path: saveStore.path })
                : t("save_sync_active_rclone", { remote: saveStore.remote })}
            </span>
          </div>
          <p className="settings-integration-card__description">
            {t("save_sync_active_description")}
          </p>
        </>
      ) : (
        <div className="settings-tracking__form">
          <p className="settings-integration-card__description">
            {t("save_sync_description")}
          </p>
          <SelectField
            label={t("save_sync_target")}
            value={kind}
            options={[
              {
                key: "folder",
                value: "folder",
                label: t("save_sync_target_folder"),
              },
              {
                key: "rclone",
                value: "rclone",
                label: t("cloud_target_rclone_option"),
              },
            ]}
            onChange={(event) => setKind(event.target.value as TargetKind)}
          />
          {kind === "folder" ? (
            <TextField
              label={t("save_sync_folder")}
              value={folder}
              readOnly
              rightContent={
                <Button theme="outline" onClick={() => void chooseFolder()}>
                  <FileDirectoryIcon />
                  {t("save_sync_choose_folder")}
                </Button>
              }
            />
          ) : (
            <>
              <TextField
                label={t("save_sync_rclone_remote")}
                value={remote}
                placeholder="r2:hydra-saves"
                hint={t("save_sync_rclone_hint")}
                onChange={(event) => setRemote(event.target.value)}
              />
              {rcloneAvailable === false ? (
                <p className="settings-integration-card__message settings-tracking__error">
                  {t("save_sync_rclone_missing")}{" "}
                  <button
                    type="button"
                    className="settings-cloud__link"
                    onClick={checkRclone}
                  >
                    {t("cloud_rclone_check_again")}
                  </button>
                </p>
              ) : (
                rcloneAvailable && (
                  <p className="settings-integration-card__description">
                    {t("cloud_rclone_found")}
                  </p>
                )
              )}
              <button
                type="button"
                className="settings-cloud__link"
                onClick={onOpenR2Guide}
              >
                {t("cloud_r2_guide_link")}
              </button>
            </>
          )}
        </div>
      )}
    </SettingsIntegrationCard>
  );
}
