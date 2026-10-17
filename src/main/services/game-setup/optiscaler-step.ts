import { OptiScaler } from "@main/services/optiscaler/optiscaler";
import type { GameSetupStep } from "./game-setup";

export const OPTISCALER_STEP_ID = "optiscaler";

/** Runs after the Wine prefix exists and before the post-install command. */
export const optiScalerStep: GameSetupStep = {
  id: OPTISCALER_STEP_ID,
  order: 500,
  run: async (context) => {
    await OptiScaler.installIfEligible(context.game);
  },
};
