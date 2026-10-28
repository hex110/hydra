import { useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SyncIcon } from "@primer/octicons-react";
import { Button, CheckboxField } from "@renderer/components";
import { settingsContext } from "@renderer/context";
import { useAppSelector, useDate, useToast } from "@renderer/hooks";
import type {
  CloudLibraryImportOption,
  IntegrationStatuses,
  SaveStoreDevice,
} from "@types";

import {
  SettingsIntegrationCard,
  SettingsIntegrationLastSynced,
} from "./settings-integration-card";
import { IntegrationSection } from "./settings-tracking-shared";

import "./settings-tracking.scss";
import "./settings-cloud.scss";

/**
 * What follows you between devices through the save store, who syncs, and the
 * on-request import of another device's list of games.
 */
export function SettingsCloudLibrary() {
  const { t } = useTranslation("settings");
  const { formatDateTime } = useDate();
  const { updateUserPreferences } = useContext(settingsContext);
  const enabled = useAppSelector(
    (state) => state.userPreferences.value?.saveStoreSyncLibrary !== false
  );

  const [statuses, setStatuses] = useState<IntegrationStatuses | null>(null);
  const [devices, setDevices] = useState<SaveStoreDevice[] | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [imports, setImports] = useState<CloudLibraryImportOption[] | null>(
    null
  );
  const [importing, setImporting] = useState<string | null>(null);
  const { showSuccessToast, showErrorToast } = useToast();

  const refresh = useCallback(() => {
    window.electron
      .getIntegrationStatuses()
      .then(setStatuses)
      .catch(() => {});
    window.electron
      .listSyncDevices()
      .then(setDevices)
      .catch(() => setDevices([]));
    window.electron
      .listCloudLibraryImports()
      .then(setImports)
      .catch(() => setImports([]));
  }, []);

  useEffect(() => {
    refresh();
    return window.electron.onIntegrationStatusChanged(refresh);
  }, [refresh]);

  const syncNow = async () => {
    setIsSyncing(true);
    try {
      await window.electron.syncCloudLibraryNow();
    } finally {
      setIsSyncing(false);
      refresh();
    }
  };

  const importLibrary = async (option: CloudLibraryImportOption) => {
    setImporting(option.deviceId);
    try {
      const { imported } = await window.electron.importCloudLibrary(
        option.deviceId
      );
      showSuccessToast(t("cloud_library_import_done", { count: imported }));
    } catch {
      showErrorToast(t("cloud_library_import_failed"));
    } finally {
      setImporting(null);
      refresh();
    }
  };

  const cloud = statuses?.cloud;

  return (
    <SettingsIntegrationCard
      title={t("cloud_library_title")}
      logo={<SyncIcon />}
      status={enabled ? t("save_sync_on") : t("save_sync_off")}
      statusTone={enabled ? "success" : "neutral"}
      actions={
        enabled && (
          <Button
            theme="outline"
            disabled={isSyncing}
            onClick={() => void syncNow()}
          >
            {t("cloud_library_sync_now")}
          </Button>
        )
      }
    >
      <p className="settings-integration-card__description">
        {t("cloud_library_description")}
      </p>

      <CheckboxField
        label={t("cloud_library_toggle")}
        checked={enabled}
        onChange={() =>
          void updateUserPreferences({ saveStoreSyncLibrary: !enabled })
        }
      />

      {enabled && (
        <>
          {cloud?.lastError ? (
            <p className="settings-integration-card__message settings-tracking__error">
              {t("cloud_library_failed")}
            </p>
          ) : (
            <SettingsIntegrationLastSynced
              lastSyncedAt={
                cloud?.lastSyncedAt
                  ? new Date(cloud.lastSyncedAt).toISOString()
                  : null
              }
            />
          )}

          <IntegrationSection title={t("cloud_devices")}>
            {devices?.length === 0 ? (
              <p className="settings-cloud__muted">
                {t("cloud_devices_empty")}
              </p>
            ) : (
              <ul className="settings-cloud__devices">
                {devices?.map((device) => (
                  <li key={device.id}>
                    <strong>
                      {device.hostname ?? device.id.slice(0, 8)}
                      {device.isThisDevice && ` (${t("cloud_device_this")})`}
                    </strong>
                    <span className="settings-cloud__muted">
                      {t("cloud_device_row", {
                        count: device.games,
                        date: formatDateTime(device.updatedAt),
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </IntegrationSection>

          <IntegrationSection
            title={t("cloud_library_import_title")}
            description={t("cloud_library_import_description")}
          >
            {imports?.length === 0 ? (
              <p className="settings-cloud__muted">
                {t("cloud_library_import_empty")}
              </p>
            ) : (
              <ul className="settings-cloud__devices settings-cloud__devices--rows">
                {imports?.map((option) => (
                  <li key={option.deviceId}>
                    <div>
                      <strong>
                        {option.hostname ?? option.deviceId.slice(0, 8)}
                      </strong>
                      <span className="settings-cloud__muted">
                        {t("cloud_library_import_row", {
                          total: option.games,
                          count: option.newGames,
                        })}
                      </span>
                    </div>
                    <Button
                      theme="outline"
                      disabled={importing !== null || option.newGames === 0}
                      onClick={() => void importLibrary(option)}
                    >
                      {t("cloud_library_import_button")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </IntegrationSection>
        </>
      )}
    </SettingsIntegrationCard>
  );
}
