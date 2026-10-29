import { resolveReShadeIniOverrides } from "@shared";
import { applyReShadeIniOverrides } from "@main/services/reshade/game-files";
import { done, skipped, type GameSetupStep } from "./game-setup";

export const RESHADE_STEP_ID = "reshade";

/** Runs before OptiScaler, so anything that installs ReShade later sees the same overrides. */
export const reShadeStep: GameSetupStep = {
  id: RESHADE_STEP_ID,
  order: 450,
  run: async (context) => {
    const overrides = resolveReShadeIniOverrides(context.userPreferences);
    const result = await applyReShadeIniOverrides(
      context.gameDirectory,
      overrides
    );
    return result === "missing" ? skipped("not-found") : done(result);
  },
};
