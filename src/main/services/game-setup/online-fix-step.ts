import path from "node:path";
import { updateGameRecord } from "@main/services/game-record-updater";
import { logger } from "@main/services/logger";
import { SystemPath } from "@main/services/system-path";
import { Wine } from "@main/services/wine";
import { resolveGameRootForDetection } from "@main/services/optiscaler/game-files";
import type { GameOnlineFix } from "@types";
import type { GameSetupStep } from "./game-setup";
import {
  copySteamClientFiles,
  detectOnlineFix,
  getSteamClientSourceDirectories,
} from "./online-fix";

export const ONLINE_FIX_STEP_ID = "online-fix";

const isPrefixValid = (winePrefixPath: string) => {
  try {
    return Wine.validatePrefix(winePrefixPath);
  } catch {
    return false;
  }
};

/**
 * Records whether a game uses OnlineFix and gives its prefix the Steam client
 * files OnlineFix loads. The proxy DLL overrides are applied at launch.
 */
export const prepareOnlineFixGame = async ({
  gameKey,
  executablePath,
  winePrefixPath,
}: {
  gameKey: string;
  executablePath: string;
  winePrefixPath: string | null;
}): Promise<GameOnlineFix | null> => {
  const detection = await detectOnlineFix(
    resolveGameRootForDetection(path.dirname(executablePath))
  );
  await updateGameRecord(gameKey, { onlineFix: detection });

  // Files copied into a prefix Proton has not created yet would be lost.
  if (!detection || !winePrefixPath || !isPrefixValid(winePrefixPath)) {
    return detection;
  }

  const sources = await getSteamClientSourceDirectories([
    path.dirname(winePrefixPath),
    // Upstream Hydra's prefixes, when it is installed next to this app.
    path.join(SystemPath.getPath("appData"), "hydralauncher", "wine-prefixes"),
  ]);

  const { copied, missing } = await copySteamClientFiles(
    winePrefixPath,
    sources
  );

  logger.info("[GameSetup] Prepared OnlineFix game", {
    gameKey,
    proxyDlls: detection.proxyDlls,
    copied,
    missing,
  });

  return detection;
};

export const onlineFixStep: GameSetupStep = {
  id: ONLINE_FIX_STEP_ID,
  order: 200,
  run: async (context) => {
    if (context.userPreferences?.prepareOnlineFixGames === false) return;
    if (path.extname(context.executablePath).toLowerCase() !== ".exe") return;

    await prepareOnlineFixGame({
      gameKey: context.gameKey,
      executablePath: context.executablePath,
      winePrefixPath: context.winePrefixPath,
    });
  },
};
