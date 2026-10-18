import { ensureInstalledVersion } from "@main/services/game-updates/installed-version";
import type { GameSetupStep } from "./game-setup";

export const INSTALLED_VERSION_STEP_ID = "installed-version";

/** Records which release is installed, for update detection. */
export const installedVersionStep: GameSetupStep = {
  id: INSTALLED_VERSION_STEP_ID,
  order: 50,
  run: async (context) => {
    await ensureInstalledVersion(context.gameKey);
  },
};
