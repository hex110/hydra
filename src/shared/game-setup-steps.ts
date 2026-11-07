/**
 * Every game setup step, in the order setup runs them. The main process
 * registers one step per id (`src/main/services/game-setup/`) and the Setup
 * log in game options lists them in this order, so a new step is added here
 * first. Its log lines are `setup_log_<id>_<code>` in the game_details
 * namespace, with dashes as underscores.
 */
export const GAME_SETUP_STEP_IDS = [
  "installed-version",
  "wine-prefix",
  "online-fix",
  "save-import",
  "reshade",
  "renodx",
  "optiscaler",
  "post-install-command",
] as const;

export type GameSetupStepId = (typeof GAME_SETUP_STEP_IDS)[number];
