import { GameSetup } from "./game-setup";
import { optiScalerStep } from "./optiscaler-step";
import { postInstallCommandStep } from "./post-install-command-step";
import { winePrefixStep } from "./wine-prefix-step";

GameSetup.registerStep(winePrefixStep);
GameSetup.registerStep(optiScalerStep);
GameSetup.registerStep(postInstallCommandStep);

export { GameSetup };
export type { GameSetupContext, GameSetupStep } from "./game-setup";
