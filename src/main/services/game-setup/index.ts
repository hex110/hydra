import { GameSetup } from "./game-setup";
import { postInstallCommandStep } from "./post-install-command-step";
import { winePrefixStep } from "./wine-prefix-step";

GameSetup.registerStep(winePrefixStep);
GameSetup.registerStep(postInstallCommandStep);

export { GameSetup };
export type { GameSetupContext, GameSetupStep } from "./game-setup";
