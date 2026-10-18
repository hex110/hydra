import { OptiScaler } from "@main/services/optiscaler/optiscaler";
import { done, skipped, type GameSetupStep } from "./game-setup";

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
