import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { logsPath } from "@main/constants";
import { logger } from "@main/services/logger";
import { updateGameRecord } from "@main/services/game-record-updater";
import type { GameSetupContext, GameSetupStep } from "./game-setup";

export const POST_INSTALL_COMMAND_STEP_ID = "post-install-command";

const COMMAND_TIMEOUT_MS = 15 * 60 * 1000;

export const getPostInstallCommandEnvironment = (
  context: GameSetupContext
): Record<string, string> => ({
  HYDRA_GAME_TITLE: context.game.title,
  HYDRA_GAME_SHOP: context.shop,
  HYDRA_GAME_OBJECT_ID: context.objectId,
  HYDRA_GAME_DIR: context.gameDirectory,
  HYDRA_GAME_EXECUTABLE: context.executablePath,
  HYDRA_SETUP_REASON: context.reason,
  ...(context.winePrefixPath
    ? {
        WINEPREFIX: context.winePrefixPath,
        HYDRA_WINE_PREFIX: context.winePrefixPath,
      }
    : {}),
  ...(context.protonPath ? { PROTONPATH: context.protonPath } : {}),
});

const runCommand = (
  command: string,
  context: GameSetupContext
): Promise<number | null> => {
  const logPath = path.join(
    logsPath,
    `post-install-${context.objectId.replaceAll(/[^\w.-]/g, "_")}.log`
  );
  fs.mkdirSync(logsPath, { recursive: true });
  const logFile = fs.openSync(logPath, "a");
  fs.writeSync(
    logFile,
    `\n[${new Date().toISOString()}] ${context.game.title}: ${command}\n`
  );

  const isWindows = process.platform === "win32";

  return new Promise((resolve, reject) => {
    const child = spawn(
      isWindows ? "cmd.exe" : "/bin/sh",
      isWindows ? ["/d", "/s", "/c", command] : ["-c", command],
      {
        cwd: context.gameDirectory,
        env: { ...process.env, ...getPostInstallCommandEnvironment(context) },
        stdio: ["ignore", logFile, logFile],
        windowsHide: true,
      }
    );

    const timeout = setTimeout(() => {
      logger.warn("[GameSetup] Post-install command timed out", {
        gameKey: context.gameKey,
      });
      child.kill("SIGTERM");
    }, COMMAND_TIMEOUT_MS);

    const finish = () => {
      clearTimeout(timeout);
      fs.closeSync(logFile);
    };

    child.once("error", (error) => {
      finish();
      reject(error);
    });
    child.once("close", (code) => {
      finish();
      resolve(code);
    });
  });
};

export const postInstallCommandStep: GameSetupStep = {
  id: POST_INSTALL_COMMAND_STEP_ID,
  order: 900,
  run: async (context) => {
    const command = context.userPreferences?.postInstallCommand?.trim();
    if (!command) return;
    if (context.game.postInstallCommandRanAt && !context.force) return;

    const exitCode = await runCommand(command, context);

    if (exitCode !== 0) {
      throw new Error(`Post-install command exited with code ${exitCode}`);
    }

    await updateGameRecord(context.gameKey, {
      postInstallCommandRanAt: new Date(),
    });
  },
};
