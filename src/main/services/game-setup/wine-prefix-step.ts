import { logger } from "@main/services/logger";
import { Umu } from "@main/services/umu";
import { Wine } from "@main/services/wine";
import { done, skipped, type GameSetupStep } from "./game-setup";

export const WINE_PREFIX_STEP_ID = "wine-prefix";

const isPrefixValid = (winePrefixPath: string) => {
  try {
    return Wine.validatePrefix(winePrefixPath);
  } catch {
    return false;
  }
};

export const winePrefixStep: GameSetupStep = {
  id: WINE_PREFIX_STEP_ID,
  order: 100,
  run: async (context) => {
    if (!context.winePrefixPath) return skipped("not-wine");
    if (
      context.userPreferences?.prepareWinePrefixOnInstall === false &&
      !context.force
    ) {
      return skipped("disabled");
    }
    if (isPrefixValid(context.winePrefixPath)) {
      return done("exists", { path: context.winePrefixPath });
    }

    logger.info("[GameSetup] Creating Wine prefix", {
      gameKey: context.gameKey,
      winePrefixPath: context.winePrefixPath,
      protonPath: context.protonPath,
    });

    await Umu.preparePrefix({
      winePrefixPath: context.winePrefixPath,
      protonPath: context.protonPath,
      gameId: context.objectId,
    });
    return done("created", { path: context.winePrefixPath });
  },
};
