import { findConflictingWrappers } from "@main/helpers/launch-wrappers";
import { logger } from "@main/services/logger";
import { publishOptiScalerFilesMissingNotification } from "@main/services/notifications";
import { OptiScaler } from "@main/services/optiscaler/optiscaler";
import type { Game } from "@types";
import {
  GameSetup,
  done,
  skipped,
  warning,
  type GameSetupStep,
} from "./game-setup";

export const OPTISCALER_STEP_ID = "optiscaler";

/** Runs after the Wine prefix exists and before the post-install command. */
export const optiScalerStep: GameSetupStep = {
  id: OPTISCALER_STEP_ID,
  order: 500,
  run: async (context) => {
    // A manual re-run installs even with automatic installation off.
    const outcome = await OptiScaler.installIfEligible(context.game, {
      ignoreAutoInstallSetting: context.force,
    });
    return outcome === "installed"
      ? done("installed", { version: context.game.optiScaler?.version ?? "" })
      : skipped(outcome);
  },
};

/**
 * Restores OptiScaler files removed outside Hydra before a launch, or warns
 * when they can't be restored. Never blocks the launch.
 */
export const checkOptiScalerBeforeLaunch = async (
  game: Game,
  launchOptions: string | null
) => {
  try {
    const wrappers = findConflictingWrappers(launchOptions);
    const check = await OptiScaler.checkFilesBeforeLaunch(game, wrappers);
    if (!check) return;

    const params = {
      files: check.missingFiles.join(", "),
      wrappers: wrappers.join(", "),
    };
    await GameSetup.recordStepResult(
      game.shop,
      game.objectId,
      OPTISCALER_STEP_ID,
      "launch",
      check.repaired
        ? done("restored", { ...params, version: check.version })
        : warning(`files-removed-${check.reason}`, params)
    );
    void publishOptiScalerFilesMissingNotification(game, check, wrappers);
  } catch (error) {
    logger.error("[OptiScaler] Launch check failed", {
      title: game.title,
      error,
    });
  }
};
