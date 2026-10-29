import { GameSetup } from "./game-setup";
import { installedVersionStep } from "./installed-version-step";
import { onlineFixStep } from "./online-fix-step";
import { optiScalerStep } from "./optiscaler-step";
import { postInstallCommandStep } from "./post-install-command-step";
import { renoDxStep } from "./renodx-step";
import { reShadeStep } from "./reshade-step";
import { saveImportStep } from "./save-import-step";
import { winePrefixStep } from "./wine-prefix-step";

GameSetup.registerStep(installedVersionStep);
GameSetup.registerStep(winePrefixStep);
GameSetup.registerStep(onlineFixStep);
GameSetup.registerStep(saveImportStep);
GameSetup.registerStep(reShadeStep);
GameSetup.registerStep(renoDxStep);
GameSetup.registerStep(optiScalerStep);
GameSetup.registerStep(postInstallCommandStep);

export { GameSetup };
export type { GameSetupContext, GameSetupStep } from "./game-setup";
