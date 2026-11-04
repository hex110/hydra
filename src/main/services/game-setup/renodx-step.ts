import { gamesSublevel, levelKeys } from "@main/level";
import type { Game } from "@types";
import { RenoDx } from "@main/services/renodx/renodx";
import { done, skipped, type GameSetupStep } from "./game-setup";

export const RENODX_STEP_ID = "renodx";

/** Runs after the ReShade settings step and before OptiScaler, so OptiScaler sees ReShade's DLL. */
export const renoDxStep: GameSetupStep = {
  id: RENODX_STEP_ID,
  order: 450,
  run: async (context) => {
    // A manual re-run installs even with automatic installation off.
    const outcome = await RenoDx.installIfSupported(context.game, {
      ignoreAutoInstallSetting: context.force,
    });
    if (outcome !== "installed") return skipped(outcome);

    // The installation is on the stored game; the context still has the old one.
    const installed = await gamesSublevel.get(context.gameKey);
    return done("installed", { mod: installed?.renoDx?.modTitle ?? "" });
  },
};

/**
 * Gives ReShade its own DLL name before the launch command is built when
 * OptiScaler, which loaded it, was removed or moved (by an update, or
 * outside the game page). Returns the game to launch with.
 */
export const relinkReShadeBeforeLaunch = async (game: Game): Promise<Game> => {
  const installation = await RenoDx.relinkReShade(game.shop, game.objectId);
  if (!installation) return game;
  return (
    (await gamesSublevel.get(levelKeys.game(game.shop, game.objectId))) ?? game
  );
};
