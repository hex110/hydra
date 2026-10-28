import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { UploadIcon } from "@primer/octicons-react";
import { Button, SelectField, TextField } from "@renderer/components";
import { buildGameDetailsPath } from "@renderer/helpers";
import type {
  ManualSaveBackupProgress,
  ManualSaveBackupScope,
  ManualSaveBackupSummary,
} from "@types";

import { SettingsIntegrationCard } from "./settings-integration-card";
import { IntegrationSection } from "./settings-tracking-shared";

import "./settings-tracking.scss";
import "./settings-cloud.scss";

const RECENT_DAYS = [1, 3, 7, 30, 90];
const CUSTOM_DAYS = "custom";
const DEFAULT_CUSTOM_DAYS = "14";

type ScopeKey = "launched" | "all" | `recent:${string}`;

const toScope = (key: ScopeKey, customDays: string): ManualSaveBackupScope => {
  if (key === "launched" || key === "all") return { kind: key };
  const days =
    key === `recent:${CUSTOM_DAYS}` ? Number(customDays) : Number(key.slice(7));
  return {
    kind: "recent",
    days: Number.isFinite(days) && days >= 1 ? days : 1,
  };
};

/** Backs up (and syncs) the saves of a chosen set of games right now. */
export function SettingsCloudSaveBackup() {
  const { t } = useTranslation("settings");
  const navigate = useNavigate();

  const [scopeKey, setScopeKey] = useState<ScopeKey>("launched");
  const [customDays, setCustomDays] = useState(DEFAULT_CUSTOM_DAYS);
  const [matching, setMatching] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<ManualSaveBackupProgress | null>(
    null
  );
  const [summary, setSummary] = useState<ManualSaveBackupSummary | null>(null);
  const [failed, setFailed] = useState(false);

  const scope = useMemo(
    () => toScope(scopeKey, customDays),
    [scopeKey, customDays]
  );

  useEffect(() => {
    let current = true;
    setMatching(null);
    setSummary(null);
    window.electron
      .countManualSaveBackupGames(scope)
      .then((count) => current && setMatching(count))
      .catch(() => current && setMatching(0));
    return () => {
      current = false;
    };
  }, [scope]);

  const start = useCallback(async (backupScope: ManualSaveBackupScope) => {
    setIsRunning(true);
    setFailed(false);
    setSummary(null);
    try {
      setSummary(await window.electron.runManualSaveBackup(backupScope));
    } catch {
      setFailed(true);
    } finally {
      setIsRunning(false);
      setProgress(null);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = window.electron.onManualSaveBackupProgress(setProgress);
    // A backup started before this tab was opened: join it to see how it ends.
    window.electron
      .isManualSaveBackupRunning()
      .then((running) => {
        if (running) void start(toScope("launched", DEFAULT_CUSTOM_DAYS));
      })
      .catch(() => {});
    return unsubscribe;
  }, [start]);

  const options = [
    {
      key: "launched",
      value: "launched",
      label: t("cloud_backup_scope_launched"),
    },
    ...RECENT_DAYS.map((days) => ({
      key: `recent:${days}`,
      value: `recent:${days}`,
      label: t("cloud_backup_scope_recent", { count: days }),
    })),
    {
      key: `recent:${CUSTOM_DAYS}`,
      value: `recent:${CUSTOM_DAYS}`,
      label: t("cloud_backup_scope_custom"),
    },
    { key: "all", value: "all", label: t("cloud_backup_scope_all") },
  ];

  const hint =
    {
      launched: t("cloud_backup_hint_launched"),
      all: t("cloud_backup_hint_all"),
    }[scopeKey as string] ?? t("cloud_backup_hint_recent");

  return (
    <SettingsIntegrationCard
      title={t("cloud_backup_title")}
      logo={<UploadIcon />}
      status={
        isRunning
          ? t("cloud_backup_running", {
              done: progress?.done ?? 0,
              total: progress?.total ?? matching ?? 0,
            })
          : t("cloud_backup_matching", { count: matching ?? 0 })
      }
      actions={
        isRunning ? (
          <Button
            theme="outline"
            onClick={() => void window.electron.cancelManualSaveBackup()}
          >
            {t("cloud_backup_cancel")}
          </Button>
        ) : (
          <Button disabled={!matching} onClick={() => void start(scope)}>
            {t("cloud_backup_start")}
          </Button>
        )
      }
    >
      <p className="settings-integration-card__description">
        {t("cloud_backup_description")}
      </p>

      <SelectField
        label={t("cloud_backup_scope")}
        value={scopeKey}
        disabled={isRunning}
        options={options}
        onChange={(event) => setScopeKey(event.target.value as ScopeKey)}
      />

      {scopeKey === `recent:${CUSTOM_DAYS}` && (
        <TextField
          label={t("cloud_backup_custom_days")}
          type="number"
          min={1}
          value={customDays}
          disabled={isRunning}
          onChange={(event) => setCustomDays(event.target.value)}
        />
      )}

      <p className="settings-cloud__muted">{hint}</p>

      {isRunning && progress?.title && (
        <p className="settings-cloud__muted" aria-live="polite">
          {progress.title}
        </p>
      )}

      {failed && (
        <p className="settings-integration-card__message settings-tracking__error">
          {t("cloud_backup_failed")}
        </p>
      )}

      {summary && (
        <IntegrationSection title={t("cloud_backup_result")}>
          <p className="settings-cloud__muted">
            {t(
              summary.cancelled
                ? "cloud_backup_result_cancelled"
                : "cloud_backup_result_done",
              {
                uploaded: summary.uploaded,
                restored: summary.restored,
                unchanged: summary.unchanged,
                skipped: summary.skipped,
                failed: summary.failed,
              }
            )}
          </p>

          {summary.conflicts.length > 0 && (
            <>
              <p className="settings-cloud__warning">
                {t("cloud_backup_conflicts", {
                  count: summary.conflicts.length,
                })}
              </p>
              <ul className="settings-cloud__devices">
                {summary.conflicts.map((game) => (
                  <li key={`${game.shop}:${game.objectId}`}>
                    <button
                      type="button"
                      className="settings-cloud__link"
                      onClick={() => navigate(buildGameDetailsPath(game))}
                    >
                      {game.title}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </IntegrationSection>
      )}
    </SettingsIntegrationCard>
  );
}
