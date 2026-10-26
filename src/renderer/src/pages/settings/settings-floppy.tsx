import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChecklistIcon, SyncIcon } from "@primer/octicons-react";
import {
  Button,
  CheckboxField,
  ConfirmationModal,
  Link,
  TextField,
} from "@renderer/components";
import { useAppSelector, useToast } from "@renderer/hooks";
import { settingsContext } from "@renderer/context";
import type {
  FloppyBackfillReport,
  FloppyPullResult,
  FloppySyncStatus,
  FloppyUnmatchedGame,
} from "@types";

import {
  SettingsIntegrationCard,
  SettingsIntegrationLastSynced,
} from "./settings-integration-card";
import {
  IntegrationSection,
  useRemoveImportsPrompt,
  useTrackingStatus,
} from "./settings-tracking-shared";
import { useTaskErrorMessage } from "../downloads/use-task-error-message";

import "./settings-tracking.scss";

const FLOPPY_URL = "https://github.com/dannyvfilms/floppy";
const FORM_ID = "settings-floppy-connect";

const toIso = (ms: number | null | undefined) =>
  ms ? new Date(ms).toISOString() : null;

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

function FloppySyncDetails({
  report,
}: Readonly<{ report: FloppyBackfillReport }>) {
  const { t } = useTranslation("settings");

  const statusLabel = (status: number | null) =>
    status === null ? t("floppy_not_tracked") : t(`floppy_status_${status}`);

  return (
    <div className="settings-tracking__details">
      {report.changes.length > 0 && (
        <details>
          <summary>
            {t(report.dryRun ? "floppy_would_change" : "floppy_changed", {
              count: report.changes.length,
            })}
          </summary>
          <ul className="settings-tracking__list">
            {[...report.changes]
              .sort((a, b) => a.title.localeCompare(b.title))
              .map((change) => (
                <li key={change.title}>
                  <strong>{change.title}</strong>
                  <span>
                    {statusLabel(change.fromStatus)} →{" "}
                    {statusLabel(change.toStatus)}
                    {change.fromMinutes !== change.toMinutes &&
                      ` · ${t("floppy_minutes", { from: change.fromMinutes, to: change.toMinutes })}`}
                  </span>
                </li>
              ))}
          </ul>
        </details>
      )}

      {report.unmatched.length > 0 && (
        <details>
          <summary>
            {t("floppy_unmatched", { count: report.unmatched.length })}
          </summary>
          <ul className="settings-tracking__list">
            {[...report.unmatched].sort().map((title) => (
              <li key={title}>{title}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function SettingsFloppy() {
  const userPreferences = useAppSelector(
    (state) => state.userPreferences.value
  );
  const { updateUserPreferences } = useContext(settingsContext);
  const { showSuccessToast, showErrorToast } = useToast();
  const { t } = useTranslation("settings");
  const taskErrorMessage = useTaskErrorMessage();
  const { statuses, isRunning } = useTrackingStatus();
  const { offerRemoval, modal: removeImportsModal } = useRemoveImportsPrompt();

  const [isBusy, setIsBusy] = useState(false);
  const [syncStatus, setSyncStatus] = useState<FloppySyncStatus | null>(null);
  const [pullResult, setPullResult] = useState<FloppyPullResult | null>(null);
  const [form, setForm] = useState(() => ({
    url: userPreferences?.floppyUrl ?? "",
    token: "",
  }));
  const [disconnect, setDisconnect] = useState<{
    removable: number;
    remove: boolean;
  } | null>(null);

  const isConnected = Boolean(
    userPreferences?.floppyEnabled &&
      userPreferences.floppyUrl &&
      userPreferences.floppyApiToken
  );
  const floppyStatus = statuses?.floppy;
  const pulling = isBusy || isRunning("floppy-pull");
  const backfillRunning = syncStatus?.running === true;
  const addToLibrary = userPreferences?.floppyAddToLibrary === true;

  useEffect(() => {
    if (!isConnected && userPreferences?.floppyUrl) {
      setForm((prev) => ({
        ...prev,
        url: prev.url || userPreferences.floppyUrl!,
      }));
    }
  }, [isConnected, userPreferences?.floppyUrl]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      const current = await window.electron
        .getFloppySyncStatus()
        .catch(() => null);
      if (cancelled || !current) return;
      setSyncStatus(current);
      if (current.running) timer = setTimeout(poll, 1000);
    };

    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [backfillRunning]);

  const handleConnect: React.FormEventHandler<HTMLFormElement> = async (
    event
  ) => {
    event.preventDefault();
    setIsBusy(true);

    try {
      const url = form.url.trim();
      const token = form.token.trim();
      await window.electron.testFloppyConnection(url, token);
      await updateUserPreferences({
        floppyEnabled: true,
        floppyUrl: url,
        floppyApiToken: token,
      });
      setForm({ url, token: "" });
      showSuccessToast(t("floppy_connection_ok"));
    } catch {
      showErrorToast(t("floppy_connection_failed"));
    } finally {
      setIsBusy(false);
    }
  };

  const handlePull = async () => {
    setIsBusy(true);

    try {
      const result = await window.electron.pullFloppy();
      setPullResult(result);
      showSuccessToast(t("floppy_pull_result", { ...result }));
    } catch {
      showErrorToast(t("floppy_pull_failed"));
    } finally {
      setIsBusy(false);
    }
  };

  const handleBackfill = async (dryRun: boolean) => {
    try {
      setSyncStatus(await window.electron.syncFloppyLibrary(dryRun));
    } catch {
      showErrorToast(t("floppy_sync_failed"));
    }
  };

  const handleAddCustom = async (game: FloppyUnmatchedGame) => {
    try {
      await window.electron.addFloppyGameAsCustom(
        game.mediaId,
        game.title,
        game.image
      );
      setPullResult((current) =>
        current
          ? {
              ...current,
              unmatched: current.unmatched.filter(
                (item) => item.mediaId !== game.mediaId
              ),
            }
          : current
      );
      showSuccessToast(t("floppy_custom_added", { title: game.title }));
    } catch {
      showErrorToast(t("floppy_custom_failed"));
    }
  };

  const toggleAddToLibrary = async () => {
    await updateUserPreferences({ floppyAddToLibrary: !addToLibrary });
    if (addToLibrary) {
      setPullResult(null);
      void offerRemoval("floppy");
    }
  };

  const openDisconnect = async () => {
    const removable = await window.electron
      .countRemovableImports("floppy")
      .catch(() => 0);
    setDisconnect({ removable, remove: removable > 0 });
  };

  const handleDisconnect = async () => {
    if (!disconnect) return;
    setIsBusy(true);

    try {
      // The URL stays so reconnecting only needs a token.
      await updateUserPreferences({
        floppyEnabled: false,
        floppyApiToken: null,
      });
      if (disconnect.remove) {
        await window.electron.removeImportedGames("floppy");
      }
      await window.electron.resetIntegrationStatus("floppy");
      setPullResult(null);
      showSuccessToast(t("floppy_disconnected"));
    } catch {
      showErrorToast(t("floppy_disconnect_failed"));
    } finally {
      setIsBusy(false);
      setDisconnect(null);
    }
  };

  const renderBackfillStatus = () => {
    if (!syncStatus) return null;
    const { running, report, error, processed, total } = syncStatus;

    if (running) return t("floppy_sync_progress", { processed, total });
    if (error) return t("floppy_sync_failed");
    if (!report) return null;

    return t(
      report.dryRun ? "floppy_sync_preview_result" : "floppy_sync_result",
      {
        created: report.created,
        updated: report.updated,
        unchanged: report.unchanged,
        unmatched: report.unmatched.length,
        failed: report.failed,
      }
    );
  };

  const lastError = floppyStatus?.lastError ?? null;
  const cardStatus = !isConnected
    ? t("integration_status_not_connected")
    : lastError
      ? t("tracking_status_failed")
      : t("tracking_status_connected");
  const statusTone = !isConnected
    ? "neutral"
    : lastError
      ? "warning"
      : "success";

  const renderActions = () => {
    if (!isConnected) {
      return (
        <Button
          type="submit"
          form={FORM_ID}
          disabled={isBusy || !form.url.trim() || !form.token.trim()}
        >
          {t("integration_connect")}
        </Button>
      );
    }

    return (
      <>
        <Button
          theme="outline"
          onClick={() => void handlePull()}
          disabled={pulling}
        >
          <SyncIcon size={14} />
          {t("integration_sync")}
        </Button>
        <Button
          theme="danger"
          onClick={() => void openDisconnect()}
          disabled={pulling || backfillRunning}
        >
          {t("integration_disconnect")}
        </Button>
      </>
    );
  };

  const renderConnectForm = () => (
    <form
      id={FORM_ID}
      className="settings-tracking__form"
      onSubmit={handleConnect}
    >
      <p className="settings-integration-card__description">
        {t("floppy_description")}{" "}
        <Link to={FLOPPY_URL}>{t("floppy_learn_more")}</Link>
      </p>
      <TextField
        label={t("floppy_url")}
        value={form.url}
        placeholder="http://localhost:8000"
        onChange={(event) => setForm({ ...form, url: event.target.value })}
      />
      <TextField
        label={t("floppy_api_token")}
        value={form.token}
        type="password"
        placeholder={t("floppy_api_token")}
        hint={t("floppy_api_token_hint")}
        onChange={(event) => setForm({ ...form, token: event.target.value })}
      />
    </form>
  );

  const renderConnected = () => (
    <>
      <div className="settings-integration-card__account">
        <span className="settings-integration-card__username">
          {hostOf(userPreferences?.floppyUrl ?? "")}
        </span>
        <SettingsIntegrationLastSynced
          lastSyncedAt={toIso(floppyStatus?.lastSyncedAt)}
        />
      </div>

      {lastError && (
        <p className="settings-integration-card__message settings-tracking__error">
          {taskErrorMessage("floppy-pull", lastError)}
        </p>
      )}

      <p className="settings-integration-card__description">
        {t("floppy_connected_description")}
      </p>

      <IntegrationSection
        title={t("tracking_section_library")}
        description={t("floppy_library_description")}
      >
        <CheckboxField
          label={t("floppy_add_to_library")}
          checked={addToLibrary}
          onChange={() => void toggleAddToLibrary()}
        />

        {addToLibrary && pullResult && pullResult.unmatched.length > 0 && (
          <details className="settings-tracking__details">
            <summary>
              {t("floppy_unmatched_import", {
                count: pullResult.unmatched.length,
              })}
            </summary>
            <ul className="settings-tracking__list">
              {[...pullResult.unmatched]
                .sort((x, y) => x.title.localeCompare(y.title))
                .map((game) => (
                  <li key={game.mediaId}>
                    <span>{game.title}</span>
                    <Button
                      theme="outline"
                      size="small"
                      disabled={isBusy}
                      onClick={() => void handleAddCustom(game)}
                    >
                      {t("floppy_add_custom")}
                    </Button>
                  </li>
                ))}
            </ul>
          </details>
        )}
      </IntegrationSection>

      <IntegrationSection title={t("tracking_section_dates")}>
        <CheckboxField
          label={t("floppy_fill_dates")}
          checked={userPreferences?.floppyFillDates !== false}
          onChange={() =>
            updateUserPreferences({
              floppyFillDates: userPreferences?.floppyFillDates === false,
            })
          }
        />
      </IntegrationSection>

      <IntegrationSection
        title={t("floppy_section_backfill")}
        description={t("floppy_backfill_description")}
      >
        <div className="settings-tracking__row">
          <Button
            theme="outline"
            disabled={pulling || backfillRunning}
            onClick={() => void handleBackfill(true)}
          >
            {t("floppy_preview_library")}
          </Button>
          <Button
            theme="outline"
            disabled={pulling || backfillRunning}
            onClick={() => void handleBackfill(false)}
          >
            {t("floppy_sync_library")}
          </Button>
        </div>
        {renderBackfillStatus() && (
          <p className="settings-integration-card__meta">
            {renderBackfillStatus()}
          </p>
        )}
        {syncStatus?.report && !syncStatus.running && (
          <FloppySyncDetails report={syncStatus.report} />
        )}
      </IntegrationSection>
    </>
  );

  return (
    <>
      <SettingsIntegrationCard
        title={t("floppy_title")}
        logo={<ChecklistIcon />}
        status={cardStatus}
        statusTone={statusTone}
        actions={renderActions()}
      >
        {isConnected ? renderConnected() : renderConnectForm()}
      </SettingsIntegrationCard>

      <ConfirmationModal
        visible={disconnect !== null}
        title={t("floppy_disconnect_title")}
        descriptionText={t("floppy_disconnect_description")}
        confirmButtonLabel={t("integration_disconnect")}
        cancelButtonLabel={t("cancel")}
        confirmButtonTheme="danger"
        buttonsIsDisabled={isBusy}
        onConfirm={() => void handleDisconnect()}
        onClose={() => setDisconnect(null)}
      >
        {disconnect && disconnect.removable > 0 && (
          <CheckboxField
            label={t("floppy_disconnect_remove", {
              count: disconnect.removable,
            })}
            checked={disconnect.remove}
            onChange={() =>
              setDisconnect({ ...disconnect, remove: !disconnect.remove })
            }
          />
        )}
      </ConfirmationModal>

      {removeImportsModal}
    </>
  );
}
