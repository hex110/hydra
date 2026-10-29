import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CopyIcon, FileDirectoryIcon } from "@primer/octicons-react";

import { Button } from "@renderer/components";
import { useDate } from "@renderer/hooks";
import { logger } from "@renderer/logger";
import type { GameRun, GameRunOutcome, LibraryGame } from "@types";

const OUTCOME_STATUS: Record<GameRunOutcome, string> = {
  running: "never",
  ended: "done",
  error: "failed",
  closed_early: "failed",
  launch_failed: "failed",
  unknown: "warning",
};

const baseName = (filePath: string) => filePath.split(/[\\/]/).pop() ?? "";

export function RunsSection({ game }: Readonly<{ game: LibraryGame }>) {
  const { t } = useTranslation("game_details");
  const { formatDateTime } = useDate();
  const [runs, setRuns] = useState<GameRun[] | null>(null);
  const [copiedRunId, setCopiedRunId] = useState<string | null>(null);

  const loadRuns = useCallback(() => {
    window.electron
      .getGameRuns(game.shop, game.objectId)
      .then(setRuns)
      .catch((error) => {
        logger.error("Failed to load game runs", error);
        setRuns([]);
      });
  }, [game.shop, game.objectId]);

  useEffect(() => {
    loadRuns();
    return window.electron.onGameRunsChanged((shop, objectId) => {
      if (shop === game.shop && objectId === game.objectId) loadRuns();
    });
  }, [game.shop, game.objectId, loadRuns]);

  const copyDiagnostics = async (run: GameRun) => {
    const summary = await window.electron.getGameRunSummary(
      game.shop,
      game.objectId,
      run.id
    );
    if (!summary) return;
    await window.electron.clipboard.writeText(summary);
    setCopiedRunId(run.id);
  };

  const formatDuration = (milliseconds: number | null) => {
    if (milliseconds === null) return null;
    const minutes = Math.round(milliseconds / 60_000);
    if (minutes < 1)
      return t("run_duration_seconds", {
        seconds: Math.round(milliseconds / 1000),
      });
    if (minutes < 60) return t("run_duration_minutes", { minutes });
    return t("run_duration_hours", {
      hours: Math.floor(minutes / 60),
      minutes: minutes % 60,
    });
  };

  const describeExit = (run: GameRun) => {
    if (run.signal) return t("run_exit_signal", { signal: run.signal });
    if (run.exitCode !== null)
      return t("run_exit_code", { code: run.exitCode });
    return null;
  };

  const describeSetup = (run: GameRun) =>
    [
      run.launcher ? t(`run_launcher_${run.launcher}`) : null,
      run.protonPath
        ? baseName(run.protonPath)
        : run.launcher === "umu"
          ? t("run_proton_default")
          : null,
      ...run.tools.map((tool) => `${tool.name} ${tool.version}`),
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <div className="game-options-modal__section">
      <div className="game-options-modal__header">
        <h2>{t("runs_title")}</h2>
        <h4 className="game-options-modal__header-description">
          {t("runs_description")}
        </h4>
      </div>

      {runs === null && (
        <p className="game-options-modal__optiscaler-hint">
          {t("runs_loading")}
        </p>
      )}

      {runs?.length === 0 && (
        <p className="game-options-modal__optiscaler-hint">{t("runs_empty")}</p>
      )}

      {runs && runs.length > 0 && (
        <>
          <div>
            <Button
              type="button"
              theme="outline"
              onClick={() =>
                window.electron.openGameRunFolder(game.shop, game.objectId)
              }
            >
              <FileDirectoryIcon size={14} />
              {t("runs_open_all")}
            </Button>
          </div>

          <ul className="game-options-modal__setup-log">
            {runs.map((run) => {
              const duration = formatDuration(run.durationInMilliseconds);
              const exit = describeExit(run);
              return (
                <li key={run.id} className="game-options-modal__setup-log-step">
                  <span
                    className={`game-options-modal__setup-log-status game-options-modal__setup-log-status--${OUTCOME_STATUS[run.outcome]}`}
                  >
                    {t(`run_outcome_${run.outcome}`)}
                  </span>
                  <div className="game-options-modal__setup-log-details">
                    <strong>
                      {formatDateTime(run.startedAt)}
                      {duration ? ` · ${duration}` : ""}
                    </strong>
                    <span>{describeSetup(run) || t("run_no_details")}</span>
                    <small>
                      {[
                        exit,
                        run.logs.length > 0
                          ? t("run_logs", {
                              names: run.logs.map((log) => log.name).join(", "),
                            })
                          : t("run_no_logs"),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  </div>
                  <Button
                    type="button"
                    theme="outline"
                    onClick={() => void copyDiagnostics(run)}
                  >
                    <CopyIcon size={14} />
                    {copiedRunId === run.id
                      ? t("run_copied")
                      : t("run_copy_diagnostics")}
                  </Button>
                  <Button
                    type="button"
                    theme="outline"
                    title={t("run_open_folder")}
                    aria-label={t("run_open_folder")}
                    onClick={() =>
                      window.electron.openGameRunFolder(
                        game.shop,
                        game.objectId,
                        run.id
                      )
                    }
                  >
                    <FileDirectoryIcon size={14} />
                  </Button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
