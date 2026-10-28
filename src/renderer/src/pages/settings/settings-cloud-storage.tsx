import { useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DatabaseIcon } from "@primer/octicons-react";
import { Button, SelectField } from "@renderer/components";
import { settingsContext } from "@renderer/context";
import { useAppSelector, useToast } from "@renderer/hooks";
import { formatBytes } from "@shared";
import type { SaveStoreUsage } from "@types";

import { SettingsIntegrationCard } from "./settings-integration-card";

import "./settings-tracking.scss";
import "./settings-cloud.scss";

const KEEP_OPTIONS = [1, 3, 5, 10, 0];
const DEFAULT_KEEP_VERSIONS = 5;

/** What the save store holds, and the retention that keeps it from growing. */
export function SettingsCloudStorage() {
  const { t } = useTranslation("settings");
  const { updateUserPreferences } = useContext(settingsContext);
  const { showSuccessToast, showErrorToast } = useToast();
  const keepVersions = useAppSelector(
    (state) =>
      state.userPreferences.value?.saveStoreKeepVersions ??
      DEFAULT_KEEP_VERSIONS
  );

  const [usage, setUsage] = useState<SaveStoreUsage | null>(null);
  const [failed, setFailed] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  const scan = useCallback(async () => {
    setIsBusy(true);
    setFailed(false);
    try {
      setUsage(await window.electron.getSaveStoreUsage());
    } catch {
      setFailed(true);
    } finally {
      setIsBusy(false);
    }
  }, []);

  // The numbers depend on the retention, so they are read again when it changes.
  useEffect(() => {
    void scan();
  }, [scan, keepVersions]);

  const cleanUp = async () => {
    setIsBusy(true);
    try {
      const result = await window.electron.cleanUpSaveStore();
      showSuccessToast(
        t("cloud_storage_cleaned", { size: formatBytes(result.freedBytes) })
      );
      setUsage(await window.electron.getSaveStoreUsage());
    } catch {
      showErrorToast(t("cloud_storage_failed"));
    } finally {
      setIsBusy(false);
    }
  };

  const canClean = Boolean(usage && usage.reclaimableBytes > 0);

  return (
    <SettingsIntegrationCard
      title={t("cloud_storage")}
      logo={<DatabaseIcon />}
      status={
        usage
          ? t("cloud_storage_usage", {
              size: formatBytes(usage.totalBytes),
              games: usage.games,
            })
          : t("cloud_storage_scanning")
      }
      actions={
        <>
          <Button theme="outline" disabled={isBusy} onClick={() => void scan()}>
            {t("cloud_storage_refresh")}
          </Button>
          <Button disabled={isBusy || !canClean} onClick={() => void cleanUp()}>
            {t("cloud_storage_clean")}
          </Button>
        </>
      }
    >
      <p className="settings-integration-card__description">
        {t("cloud_storage_description")}
      </p>

      <SelectField
        label={t("cloud_storage_keep")}
        value={String(keepVersions)}
        options={KEEP_OPTIONS.map((count) => ({
          key: String(count),
          value: String(count),
          label: count === 0 ? t("cloud_storage_keep_all") : String(count),
        }))}
        onChange={(event) =>
          void updateUserPreferences({
            saveStoreKeepVersions: Number(event.target.value),
          })
        }
      />

      {failed ? (
        <p className="settings-integration-card__message settings-tracking__error">
          {t("cloud_storage_failed")}
        </p>
      ) : (
        usage && (
          <p className="settings-cloud__muted">
            {canClean
              ? t("cloud_storage_reclaimable", {
                  size: formatBytes(usage.reclaimableBytes),
                })
              : t("cloud_storage_nothing")}
          </p>
        )
      )}
    </SettingsIntegrationCard>
  );
}
