import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, CheckboxField, TextField } from "@renderer/components";
import { useAppSelector, useToast } from "@renderer/hooks";
import { settingsContext } from "@renderer/context";
import type { FloppyBackfillReport, FloppySyncStatus } from "@types";

import "./settings-floppy.scss";

function FloppySyncDetails({
  report,
}: Readonly<{ report: FloppyBackfillReport }>) {
  const { t } = useTranslation("settings");

  const statusLabel = (status: number | null) =>
    status === null ? t("floppy_not_tracked") : t(`floppy_status_${status}`);

  return (
    <div className="settings-floppy__details">
      {report.changes.length > 0 && (
        <details open>
          <summary>
            {t(report.dryRun ? "floppy_would_change" : "floppy_changed", {
              count: report.changes.length,
            })}
          </summary>
          <ul className="settings-floppy__list">
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
          <ul className="settings-floppy__list">
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

  const [isBusy, setIsBusy] = useState(false);
  const [syncStatus, setSyncStatus] = useState<FloppySyncStatus | null>(null);
  const [form, setForm] = useState(() => ({
    enabled: userPreferences?.floppyEnabled ?? false,
    url: userPreferences?.floppyUrl ?? "",
    token: userPreferences?.floppyApiToken ?? "",
  }));

  useEffect(() => {
    if (!userPreferences) return;
    setForm({
      enabled: userPreferences.floppyEnabled ?? false,
      url: userPreferences.floppyUrl ?? "",
      token: userPreferences.floppyApiToken ?? "",
    });
  }, [userPreferences]);

  const canTest = form.url !== "" && form.token !== "" && !isBusy;

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (
    event
  ) => {
    event.preventDefault();
    setIsBusy(true);

    try {
      await window.electron.testFloppyConnection(form.url, form.token);
      await updateUserPreferences({
        floppyEnabled: form.enabled,
        floppyUrl: form.url,
        floppyApiToken: form.token,
      });
      showSuccessToast(t("floppy_connection_ok"));
    } catch {
      showErrorToast(t("floppy_connection_failed"));
    } finally {
      setIsBusy(false);
    }
  };

  const handleToggle = () => {
    const enabled = !form.enabled;
    setForm((prev) => ({ ...prev, enabled }));
    if (!enabled) updateUserPreferences({ floppyEnabled: false });
  };

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      const current = await window.electron.getFloppySyncStatus();
      if (!cancelled) setSyncStatus(current);
      return current.running;
    };

    const poll = async () => {
      const running = await refresh().catch(() => false);
      if (running && !cancelled) timer = setTimeout(poll, 1000);
    };

    let timer: ReturnType<typeof setTimeout> | undefined;
    void poll();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [syncStatus?.running]);

  const handleSync = async (dryRun: boolean) => {
    try {
      setSyncStatus(await window.electron.syncFloppyLibrary(dryRun));
    } catch {
      showErrorToast(t("floppy_sync_failed"));
    }
  };

  const handlePull = async () => {
    setIsBusy(true);

    try {
      const result = await window.electron.pullFloppy();
      showSuccessToast(t("floppy_pull_result", { ...result }));
    } catch {
      showErrorToast(t("floppy_pull_failed"));
    } finally {
      setIsBusy(false);
    }
  };

  const renderSyncStatus = () => {
    if (!syncStatus) return null;
    const { running, report, error, processed, total } = syncStatus;

    if (running) {
      return t("floppy_sync_progress", { processed, total });
    }
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

  const isSaved = Boolean(
    userPreferences?.floppyEnabled &&
      userPreferences.floppyUrl &&
      userPreferences.floppyApiToken
  );

  return (
    <form className="settings-floppy__form" onSubmit={handleSubmit}>
      <h3>{t("floppy_title")}</h3>
      <p className="settings-floppy__description">{t("floppy_description")}</p>

      <CheckboxField
        label={t("floppy_enable")}
        checked={form.enabled}
        onChange={handleToggle}
      />

      {form.enabled && (
        <>
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
            onChange={(event) =>
              setForm({ ...form, token: event.target.value })
            }
            rightContent={
              <Button type="submit" disabled={!canTest}>
                {t("floppy_test_connection")}
              </Button>
            }
          />

          {isSaved && (
            <div className="settings-floppy__actions">
              <Button
                type="button"
                theme="outline"
                disabled={isBusy || syncStatus?.running}
                onClick={() => handleSync(true)}
              >
                {t("floppy_preview_library")}
              </Button>
              <Button
                type="button"
                disabled={isBusy || syncStatus?.running}
                onClick={() => handleSync(false)}
              >
                {t("floppy_sync_library")}
              </Button>
              <Button
                type="button"
                theme="outline"
                disabled={isBusy || syncStatus?.running}
                onClick={handlePull}
              >
                {t("floppy_pull")}
              </Button>
              <span className="settings-floppy__status">
                {renderSyncStatus()}
              </span>
            </div>
          )}

          {syncStatus?.report && !syncStatus.running && (
            <FloppySyncDetails report={syncStatus.report} />
          )}
        </>
      )}
    </form>
  );
}
