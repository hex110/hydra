import { useCallback, useContext, useEffect, useState } from "react";

import {
  TextField,
  Button,
  Badge,
  CheckboxField,
  ConfirmationModal,
} from "@renderer/components";
import { useTranslation } from "react-i18next";

import type { DownloadSource, LocalSourceStatus } from "@types";
import {
  NoEntryIcon,
  PlusCircleIcon,
  SyncIcon,
  TrashIcon,
} from "@primer/octicons-react";
import { AddDownloadSourceModal } from "./add-download-source-modal";
import { SettingsAnkerGames } from "./settings-ankergames";
import {
  useAppDispatch,
  useAppSelector,
  useDate,
  useToast,
} from "@renderer/hooks";
import { useFormat } from "@renderer/hooks/use-format";
import { DownloadSourceStatus } from "@shared";
import { settingsContext } from "@renderer/context";
import { useNavigate } from "react-router-dom";
import { setFilters, clearFilters } from "@renderer/features";
import { levelDBService } from "@renderer/services/leveldb.service";
import { orderBy } from "lodash-es";
import "./settings-download-sources.scss";
import { logger } from "@renderer/logger";

export function SettingsDownloadSources() {
  const [
    showConfirmationDeleteAllSourcesModal,
    setShowConfirmationDeleteAllSourcesModal,
  ] = useState(false);
  const [showAddDownloadSourceModal, setShowAddDownloadSourceModal] =
    useState(false);
  const [downloadSources, setDownloadSources] = useState<DownloadSource[]>([]);
  const [hasLoadedDownloadSources, setHasLoadedDownloadSources] =
    useState(false);
  const [isSyncingDownloadSources, setIsSyncingDownloadSources] =
    useState(false);
  const [isRemovingDownloadSource, setIsRemovingDownloadSource] =
    useState(false);

  const [localSourceStatuses, setLocalSourceStatuses] = useState<
    Record<string, LocalSourceStatus>
  >({});
  const [verifyingSourceId, setVerifyingSourceId] = useState<string | null>(
    null
  );

  const { sourceUrl, clearSourceUrl, updateUserPreferences } =
    useContext(settingsContext);
  const matchLocally = useAppSelector(
    (state) =>
      state.userPreferences.value?.matchDownloadSourcesLocally !== false
  );
  const { formatDistance } = useDate();

  const { t } = useTranslation("settings");
  const { showSuccessToast } = useToast();
  const { numberFormatter } = useFormat();

  const dispatch = useAppDispatch();

  const navigate = useNavigate();

  useEffect(() => {
    if (sourceUrl) setShowAddDownloadSourceModal(true);
  }, [sourceUrl]);

  const loadLocalSourceStatuses = useCallback(async () => {
    try {
      const statuses = await window.electron.getLocalSourceStatuses();
      setLocalSourceStatuses(
        Object.fromEntries(statuses.map((status) => [status.sourceId, status]))
      );
    } catch (error) {
      logger.error("Failed to load local source statuses:", error);
    }
  }, []);

  useEffect(() => {
    void loadLocalSourceStatuses();
  }, [loadLocalSourceStatuses, downloadSources]);

  const handleVerifySource = async (source: DownloadSource) => {
    setVerifyingSourceId(source.id);
    try {
      await window.electron.verifyLocalSource(source.id);
      await loadLocalSourceStatuses();
    } catch (error) {
      logger.error("Failed to verify download source:", error);
    } finally {
      setVerifyingSourceId(null);
    }
  };

  const toggleMatchLocally = async () => {
    await updateUserPreferences({ matchDownloadSourcesLocally: !matchLocally });
    if (!matchLocally) {
      void window.electron.refreshLocalSources().then(loadLocalSourceStatuses);
    }
  };

  useEffect(() => {
    const fetchDownloadSources = async () => {
      const sources = (await levelDBService.values(
        "downloadSources"
      )) as DownloadSource[];
      const sorted = orderBy(sources, "createdAt", "desc");
      setDownloadSources(sorted);
      setHasLoadedDownloadSources(true);
    };

    fetchDownloadSources();
  }, []);

  useEffect(() => {
    const hasPendingOrMatchingSource = downloadSources.some(
      (source) =>
        source.status === DownloadSourceStatus.PendingMatching ||
        source.status === DownloadSourceStatus.Matching
    );

    if (!hasPendingOrMatchingSource || !downloadSources.length) {
      return;
    }

    const intervalId = setInterval(async () => {
      try {
        await window.electron.syncDownloadSources();
        const sources = (await levelDBService.values(
          "downloadSources"
        )) as DownloadSource[];
        const sorted = orderBy(sources, "createdAt", "desc");
        setDownloadSources(sorted);
      } catch (error) {
        logger.error("Failed to fetch download sources:", error);
      }
    }, 5000);

    return () => clearInterval(intervalId);
  }, [downloadSources]);

  const handleRemoveSource = async (downloadSource: DownloadSource) => {
    setIsRemovingDownloadSource(true);

    try {
      await window.electron.removeDownloadSource(false, downloadSource.id);
      const sources = (await levelDBService.values(
        "downloadSources"
      )) as DownloadSource[];
      const sorted = orderBy(sources, "createdAt", "desc");
      setDownloadSources(sorted);
      showSuccessToast(t("removed_download_source"));
    } catch (error) {
      logger.error("Failed to remove download source:", error);
    } finally {
      setIsRemovingDownloadSource(false);
    }
  };

  const handleRemoveAllDownloadSources = async () => {
    setIsRemovingDownloadSource(true);

    try {
      await window.electron.removeDownloadSource(true);
      const sources = (await levelDBService.values(
        "downloadSources"
      )) as DownloadSource[];
      const sorted = orderBy(sources, "createdAt", "desc");
      setDownloadSources(sorted);
      showSuccessToast(t("removed_all_download_sources"));
    } catch (error) {
      logger.error("Failed to remove all download sources:", error);
    } finally {
      setIsRemovingDownloadSource(false);
      setShowConfirmationDeleteAllSourcesModal(false);
    }
  };

  const handleAddDownloadSource = async () => {
    try {
      const sources = (await levelDBService.values(
        "downloadSources"
      )) as DownloadSource[];
      const sorted = orderBy(sources, "createdAt", "desc");
      setDownloadSources(sorted);
    } catch (error) {
      logger.error("Failed to refresh download sources:", error);
    }
  };

  const syncDownloadSources = async () => {
    setIsSyncingDownloadSources(true);
    try {
      await window.electron.syncDownloadSources();
      const sources = (await levelDBService.values(
        "downloadSources"
      )) as DownloadSource[];
      const sorted = orderBy(sources, "createdAt", "desc");
      setDownloadSources(sorted);

      if (matchLocally) {
        void window.electron
          .refreshLocalSources()
          .then(loadLocalSourceStatuses);
      }

      showSuccessToast(t("download_sources_synced_successfully"));
    } finally {
      setIsSyncingDownloadSources(false);
    }
  };

  const statusTitle = {
    [DownloadSourceStatus.PendingMatching]: t(
      "download_source_pending_matching"
    ),
    [DownloadSourceStatus.Matched]: t("download_source_matched"),
    [DownloadSourceStatus.Matching]: t("download_source_matching"),
    [DownloadSourceStatus.Failed]: t("download_source_failed"),
  };

  const handleModalClose = () => {
    clearSourceUrl();
    setShowAddDownloadSourceModal(false);
  };

  const navigateToCatalogue = (fingerprint?: string) => {
    if (!fingerprint) {
      logger.error("Cannot navigate: fingerprint is undefined");
      return;
    }

    dispatch(clearFilters());
    dispatch(setFilters({ downloadSourceFingerprints: [fingerprint] }));

    navigate("/catalogue");
  };

  return (
    <>
      <AddDownloadSourceModal
        visible={showAddDownloadSourceModal}
        onClose={handleModalClose}
        onAddDownloadSource={handleAddDownloadSource}
      />
      <ConfirmationModal
        cancelButtonLabel={t("cancel_button_confirmation_delete_all_sources")}
        confirmButtonLabel={t("confirm_button_confirmation_delete_all_sources")}
        descriptionText={t("description_confirmation_delete_all_sources")}
        clickOutsideToClose={false}
        onConfirm={handleRemoveAllDownloadSources}
        visible={showConfirmationDeleteAllSourcesModal}
        title={t("title_confirmation_delete_all_sources")}
        onClose={() => setShowConfirmationDeleteAllSourcesModal(false)}
        buttonsIsDisabled={isRemovingDownloadSource}
      />

      <p>{t("download_sources_description")}</p>

      <SettingsAnkerGames />

      <div className="settings-download-sources__local-matching">
        <CheckboxField
          label={t("match_download_sources_locally")}
          checked={matchLocally}
          onChange={toggleMatchLocally}
        />
        <small>{t("match_download_sources_locally_description")}</small>
      </div>

      <div className="settings-download-sources__header">
        <Button
          type="button"
          theme="outline"
          disabled={
            (hasLoadedDownloadSources && !downloadSources.length) ||
            isSyncingDownloadSources ||
            isRemovingDownloadSource
          }
          onClick={syncDownloadSources}
        >
          <SyncIcon />
          {t("sync_download_sources")}
        </Button>

        <div className="settings-download-sources__buttons-container">
          <Button
            type="button"
            theme="danger"
            onClick={() => setShowConfirmationDeleteAllSourcesModal(true)}
            disabled={
              isRemovingDownloadSource ||
              isSyncingDownloadSources ||
              (hasLoadedDownloadSources && !downloadSources.length)
            }
          >
            <TrashIcon />
            {t("button_delete_all_sources")}
          </Button>

          <Button
            type="button"
            theme="outline"
            onClick={() => setShowAddDownloadSourceModal(true)}
            disabled={isSyncingDownloadSources || isRemovingDownloadSource}
          >
            <PlusCircleIcon />
            {t("add_download_source")}
          </Button>
        </div>
      </div>

      <ul className="settings-download-sources__list">
        {downloadSources.map((downloadSource) => {
          const isPendingOrMatching =
            downloadSource.status === DownloadSourceStatus.PendingMatching ||
            downloadSource.status === DownloadSourceStatus.Matching;

          return (
            <li
              key={downloadSource.id}
              className={`settings-download-sources__item ${isSyncingDownloadSources ? "settings-download-sources__item--syncing" : ""} ${isPendingOrMatching ? "settings-download-sources__item--pending" : ""}`}
            >
              <div className="settings-download-sources__item-header">
                <h2>{downloadSource.name}</h2>

                <div style={{ display: "flex" }}>
                  <Badge>
                    {isPendingOrMatching && (
                      <SyncIcon className="settings-download-sources__spinner" />
                    )}
                    {statusTitle[downloadSource.status]}
                  </Badge>
                </div>

                <button
                  type="button"
                  className="settings-download-sources__navigate-button"
                  disabled={!downloadSource.fingerprint}
                  onClick={() =>
                    navigateToCatalogue(downloadSource.fingerprint)
                  }
                >
                  <small>
                    {isPendingOrMatching
                      ? t("download_source_no_information")
                      : t("download_count", {
                          count: downloadSource.downloadCount,
                          countFormatted: numberFormatter.format(
                            downloadSource.downloadCount
                          ),
                        })}
                  </small>
                </button>
              </div>

              {matchLocally && (
                <LocalSourceStatusLine
                  status={localSourceStatuses[downloadSource.id]}
                  isVerifying={verifyingSourceId === downloadSource.id}
                  onVerify={() => handleVerifySource(downloadSource)}
                  formatCount={(count) => numberFormatter.format(count)}
                  formatAge={(date) =>
                    formatDistance(date, new Date(), { addSuffix: true })
                  }
                />
              )}

              <TextField
                label={t("download_source_url")}
                value={downloadSource.url}
                readOnly
                theme="dark"
                disabled
                rightContent={
                  <Button
                    type="button"
                    theme="outline"
                    onClick={() => handleRemoveSource(downloadSource)}
                    disabled={isRemovingDownloadSource}
                  >
                    <NoEntryIcon />
                    {t("remove_download_source")}
                  </Button>
                }
              />
            </li>
          );
        })}
      </ul>
    </>
  );
}

function LocalSourceStatusLine({
  status,
  isVerifying,
  onVerify,
  formatCount,
  formatAge,
}: Readonly<{
  status: LocalSourceStatus | undefined;
  isVerifying: boolean;
  onVerify: () => void;
  formatCount: (count: number) => string;
  formatAge: (date: string) => string;
}>) {
  const { t } = useTranslation("settings");

  if (!status) {
    return (
      <small className="settings-download-sources__local-status">
        {t("local_source_pending")}
      </small>
    );
  }

  const copy = status.fetchedAt
    ? t("local_source_ready", {
        count: status.entries,
        countFormatted: formatCount(status.entries),
        age: formatAge(status.fetchedAt),
      })
    : null;

  if (status.state === "failed") {
    return (
      <>
        <small className="settings-download-sources__local-status settings-download-sources__local-status--failed">
          {t("local_source_failed", { error: status.error })}
          {copy && ` ${t("local_source_using_previous", { copy })}`}
        </small>
        {status.needsVerification && (
          <div className="settings-download-sources__verify">
            <Button
              type="button"
              theme="outline"
              onClick={onVerify}
              disabled={isVerifying}
            >
              {isVerifying
                ? t("local_source_verifying")
                : t("local_source_verify")}
            </Button>
            <small>{t("local_source_verify_hint")}</small>
          </div>
        )}
      </>
    );
  }

  return (
    <small className="settings-download-sources__local-status">{copy}</small>
  );
}
