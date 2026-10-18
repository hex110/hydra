import { gamesSublevel } from "@main/level";
import { ensureInstalledVersion } from "@main/services/game-updates/installed-version";
import { done, type GameSetupStep } from "./game-setup";

export const INSTALLED_VERSION_STEP_ID = "installed-version";

/** Records which release is installed, for update detection. */
export const installedVersionStep: GameSetupStep = {
  id: INSTALLED_VERSION_STEP_ID,
  order: 50,
  run: async (context) => {
    await ensureInstalledVersion(context.gameKey);
    const game = await gamesSublevel.get(context.gameKey);
    return done(game?.installedVersion ? "recorded" : "unknown", {
      title: game?.installedVersion?.title ?? "",
    });
  },
};
