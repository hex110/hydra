import fs from "node:fs";
import path from "node:path";
import { db, levelKeys } from "@main/level";
import { Wine } from "@main/services/wine";
import type { Game, UserPreferences } from "@types";
import { parseExecutablePath } from "../events/helpers/parse-executable-path";
import { resolveGameLaunchOptions } from "./launch-additions";
import { getLaunchExecutable } from "./launcher-redirects";
import { resolveLaunchCommand } from "./resolve-launch-command";
import { resolveGameProton } from "./resolve-proton-path";
import {
  formatSteamLaunchOptions,
  steamCommandPlaceholder,
} from "./steam-launch-options-line";

/**
 * The folder Steam's Proton takes as `STEAM_COMPAT_DATA_PATH`; it runs the
 * prefix in its `pfx` subfolder. Hydra prefixes are the prefix itself, with a
 * `pfx` link back to it (umu adds the same link), so both use one prefix.
 */
const prepareCompatDataPath = async (winePrefixPath: string) => {
  if (path.basename(winePrefixPath) === "pfx") {
    return path.dirname(winePrefixPath);
  }

  await fs.promises.mkdir(winePrefixPath, { recursive: true });
  const pfxPath = path.join(winePrefixPath, "pfx");
  const hasPfx = await fs.promises
    .lstat(pfxPath)
    .then(() => true)
    .catch(() => false);
  if (!hasPfx) await fs.promises.symlink(".", pfxPath);

  return winePrefixPath;
};

/**
 * Launch options for a Steam shortcut that runs the game the way Hydra
 * would: in Hydra's prefix, with the launch options, DLL overrides, MangoHud
 * and GameMode Hydra uses now. Steam keeps them as written, so they don't
 * follow later changes to launch rules.
 */
export const getSteamShortcutLaunch = async (game: Game) => {
  const executablePath = getLaunchExecutable(
    game,
    parseExecutablePath(game.executablePath!)
  );
  const gameKey = levelKeys.game(game.shop, game.objectId);
  const userPreferences = await db
    .get<string, UserPreferences | null>(levelKeys.userPreferences, {
      valueEncoding: "json",
    })
    .catch(() => null);

  const { additions, useMangohud, useGamemode, launchOptions } =
    await resolveGameLaunchOptions({
      objectId: game.objectId,
      gameKey,
      game,
      executablePath,
      userPreferences,
      gameLaunchOptions: game.launchOptions,
      prepareMissing: false,
    });

  const isProton = path.extname(executablePath).toLowerCase() === ".exe";
  const winePrefixPath = isProton
    ? await Wine.resolvePrefixPath(
        Wine.getEffectivePrefixPath(game.winePrefixPath, game.objectId)
      )
    : null;
  const compatDataPath = winePrefixPath
    ? await prepareCompatDataPath(winePrefixPath)
    : null;

  const command = resolveLaunchCommand({
    baseCommand: steamCommandPlaceholder,
    launchOptions,
    wrapperCommands: [
      ...(useGamemode ? ["gamemoderun"] : []),
      // Under Proton MangoHud loads as a Vulkan layer, as in Hydra's launches.
      ...(useMangohud && !isProton ? ["mangohud"] : []),
    ],
  });

  const proton = isProton
    ? await resolveGameProton(game, additions.protonPath)
    : null;

  return {
    executablePath,
    launchOptions: formatSteamLaunchOptions({
      ...command,
      env: {
        ...(compatDataPath ? { STEAM_COMPAT_DATA_PATH: compatDataPath } : {}),
        ...(useMangohud && isProton ? { MANGOHUD: "1" } : {}),
        ...command.env,
      },
    }),
    protonName: proton?.path ? path.basename(proton.path) : null,
  };
};
