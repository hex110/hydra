import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SyncIcon } from "@primer/octicons-react";

import { Button } from "@renderer/components";
import { gameDetailsContext } from "@renderer/context";
import { useDate } from "@renderer/hooks";
import type { GameSetupLogEntry, LibraryGame } from "@types";

/** Setup steps in the order they run; matches the main process registry. */
const SETUP_STEPS = [
  "installed-version",
  "wine-prefix",
  "online-fix",
  "save-import",
  "optiscaler",
  "post-install-command",
];

const toKey = (value: string) => value.replaceAll("-", "_");

export function SetupLogSection({ game }: Readonly<{ game: LibraryGame }>) {
  const { t } = useTranslation("game_details");
  const { updateGame } = useContext(gameDetailsContext);
  const { formatDateTime } = useDate();
  const [runningStep, setRunningStep] = useState<string | null>(null);

  useEffect(
    () =>
      window.electron.onGameSetupStatus((event) => {
        if (event.shop !== game.shop || event.objectId !== game.objectId) {
          return;
        }
        if (event.status === "running" && event.stepId) {
          setRunningStep(event.stepId);
        } else if (event.status !== "queued" && event.status !== "running") {
          setRunningStep(null);
          void updateGame();
        }
      }),
    [game.shop, game.objectId, updateGame]
  );

  const log = game.setupLog;
  const entries = new Map(
    (log?.steps ?? []).map((entry) => [entry.stepId, entry])
  );

  const describe = (stepId: string, entry: GameSetupLogEntry | undefined) => {
    if (!entry) return t("setup_log_never_ran");
    if (entry.status === "failed") {
      return t("setup_log_failed", { error: entry.error ?? "" });
    }
    return t(`setup_log_${toKey(stepId)}_${toKey(entry.code ?? "done")}`, {
      ...entry.params,
      defaultValue: t(`setup_log_status_${entry.status}`),
    });
  };

  return (
    <div className="game-options-modal__section">
      <div className="game-options-modal__header">
        <h2>{t("setup_log_title")}</h2>
        <h4 className="game-options-modal__header-description">
          {log
            ? t("setup_log_last_run", {
                date: formatDateTime(log.lastRunAt),
                reason: t(`setup_reason_${toKey(log.reason)}`),
              })
            : t("setup_log_description")}
        </h4>
      </div>

      {log?.skipped ? (
        <p className="game-options-modal__optiscaler-hint">
          {t(`setup_log_skipped_${toKey(log.skipped)}`)}
        </p>
      ) : (
        <ul className="game-options-modal__setup-log">
          {SETUP_STEPS.map((stepId) => {
            const entry = entries.get(stepId);
            const status = entry?.status ?? "never";
            const isRunning = runningStep === stepId;
            return (
              <li key={stepId} className="game-options-modal__setup-log-step">
                <span
                  className={`game-options-modal__setup-log-status game-options-modal__setup-log-status--${status}`}
                >
                  {isRunning
                    ? t("setup_log_status_running")
                    : t(`setup_log_status_${status}`)}
                </span>
                <div className="game-options-modal__setup-log-details">
                  <strong>{t(`setup_step_${toKey(stepId)}`)}</strong>
                  <span>{describe(stepId, entry)}</span>
                  {entry && (
                    <small>
                      {formatDateTime(entry.at)} ·{" "}
                      {t("setup_log_duration", {
                        seconds: (entry.durationMs / 1000).toFixed(1),
                      })}
                    </small>
                  )}
                </div>
                <Button
                  type="button"
                  theme="outline"
                  disabled={runningStep !== null || !game.executablePath}
                  onClick={() => {
                    setRunningStep(stepId);
                    void window.electron.runGameSetup(
                      game.shop,
                      game.objectId,
                      stepId
                    );
                  }}
                >
                  <SyncIcon size={14} />
                  {t("setup_log_run_again")}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
