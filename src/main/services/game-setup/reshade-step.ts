import { resolveReShadeIniOverrides } from "@shared";
import { applyReShadeIniOverrides } from "@main/services/reshade/game-files";
import { done, skipped, type GameSetupStep } from "./game-setup";

export const RESHADE_STEP_ID = "reshade";

/** Runs before RenoDX and OptiScaler, which both leave a ReShade.ini alone once it has these. */
export const reShadeStep: GameSetupStep = {
  id: RESHADE_STEP_ID,
  order: 440,
  run: async (context) => {
    const overrides = resolveReShadeIniOverrides(context.userPreferences);
    const result = await applyReShadeIniOverrides(
      context.gameDirectory,
      overrides
    );
    return result === "missing" ? skipped("not-found") : done(result);
  },
};
