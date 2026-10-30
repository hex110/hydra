import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@renderer/components";
import { useToast } from "@renderer/hooks";
import { logger } from "@renderer/logger";
import type { OptiScalerBulkProgress, RenoDxBulkProgress } from "@types";

import "./settings-optiscaler.scss";

type BulkProgress = RenoDxBulkProgress | OptiScalerBulkProgress;

interface BulkToolState {
  installedGames: number;
  /** Games whose copy is older than the newest. */
  outdatedGames: number;
}

/** What each tool's bulk run needs; the strings live under `<tool>_*` in settings. */
const TOOLS = {
  renodx: {
    load: async (): Promise<BulkToolState> => {
      const overview = await window.electron.getRenoDxOverview();
      return {
        installedGames: overview.installedGames,
        outdatedGames: overview.outdatedGames,
      };
    },
    install: () => window.electron.runRenoDxBulk("install-supported"),
    update: () => window.electron.runRenoDxBulk("update-installed"),
    listen: (cb: (progress: BulkProgress) => void) =>
      window.electron.onRenoDxBulkProgress(cb),
    installLabel: "renodx_install_in_supported_games",
    updateLabel: "renodx_update_installed_games",
  },
  optiscaler: {
    load: async (): Promise<BulkToolState> => {
      const overview = await window.electron.getOptiScalerOverview();
      return {
        installedGames: overview.installedGames,
        outdatedGames: overview.outdatedGames,
      };
    },
    install: () => window.electron.runOptiScalerBulk("install-eligible"),
    update: () => window.electron.runOptiScalerBulk("update-installed"),
    listen: (cb: (progress: BulkProgress) => void) =>
      window.electron.onOptiScalerBulkProgress(cb),
    installLabel: "optiscaler_install_in_eligible_games",
    updateLabel: "optiscaler_update_installed_games",
  },
} as const;

export function BulkToolActions({
  tool,
}: Readonly<{ tool: keyof typeof TOOLS }>) {
  const { t } = useTranslation("settings");
  const { t: tGame } = useTranslation("game_details");
  const { showErrorToast } = useToast();
  const config = TOOLS[tool];
  const [state, setState] = useState<BulkToolState | null>(null);
  const [progress, setProgress] = useState<BulkProgress | null>(null);

  const refresh = useCallback(() => {
    config
      .load()
      .then(setState)
      .catch((error) => logger.error(`Failed to load ${tool} state`, error));
  }, [config, tool]);

  useEffect(() => {
    refresh();
    return config.listen((next) => {
      setProgress(next);
      if (next.status === "completed") refresh();
    });
  }, [config, refresh]);

  const isRunning = progress?.status === "running";
  const start = async (run: () => Promise<boolean>) => {
    if (!(await run())) showErrorToast(t(`${tool}_bulk_already_running`));
  };

  return (
    <div className="settings-context-panel__group">
      <h3>{tGame(`capability_${tool}`)}</h3>
      <p className="settings-optiscaler__muted">
        {t(`${tool}_installed_games`, { count: state?.installedGames ?? 0 })}
        {state?.outdatedGames
          ? ` ${t(`${tool}_outdated_games`, { count: state.outdatedGames })}`
          : ""}
      </p>
      {progress && (
        <p className="settings-optiscaler__muted">
          {isRunning
            ? t(`${tool}_bulk_running`, {
                processed: progress.processed,
                total: progress.total,
              })
            : t(`${tool}_bulk_completed`, {
                installed: progress.installed,
                failed: progress.failed,
              })}
        </p>
      )}
      <div className="settings-optiscaler__actions">
        <Button
          type="button"
          theme="outline"
          disabled={isRunning}
          onClick={() => start(config.install)}
        >
          {t(config.installLabel)}
        </Button>
        {!!state?.outdatedGames && (
          <Button
            type="button"
            theme="outline"
            disabled={isRunning}
            onClick={() => start(config.update)}
          >
            {t(config.updateLabel, {
              count:
                tool === "renodx" ? state.installedGames : state.outdatedGames,
            })}
          </Button>
        )}
      </div>
    </div>
  );
}
