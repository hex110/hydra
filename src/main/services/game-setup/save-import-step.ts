import { logger } from "@main/services/logger";
import {
  SaveImport,
  SaveImportFailure,
} from "@main/services/save-import/save-import";
import type { GameSetupStep } from "./game-setup";

export const SAVE_IMPORT_STEP_ID = "save-import";

/**
 * Looks for the game's saves and achievements on other Windows installs once
 * its prefix exists. Runs after OnlineFix, whose Steam files some saves sit
 * next to, and does nothing once a game's saves were imported or dismissed.
 */
export const saveImportStep: GameSetupStep = {
  id: SAVE_IMPORT_STEP_ID,
  order: 300,
  run: async (context) => {
    if (!context.winePrefixPath) return;

    try {
      await SaveImport.checkNewGame(context.shop, context.objectId);
    } catch (error) {
      if (error instanceof SaveImportFailure) {
        logger.info("[GameSetup] Save import skipped", {
          gameKey: context.gameKey,
          reason: error.code,
        });
        return;
      }
      throw error;
    }
  },
};
