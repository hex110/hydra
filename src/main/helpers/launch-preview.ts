import path from "node:path";
import { db, gamesSublevel, levelKeys } from "@main/level";
import { Umu } from "@main/services/umu";
import { Wine } from "@main/services/wine";
import type { GameLaunchPreview, GameShop, UserPreferences } from "@types";
import { parseExecutablePath } from "../events/helpers/parse-executable-path";
import { resolveGameLaunchOptions } from "./launch-additions";
import { getLaunchExecutable } from "./launcher-redirects";
import { findConflictingWrappers } from "./launch-wrappers";
import { resolveLaunchCommand } from "./resolve-launch-command";
import { resolveGameProton } from "./resolve-proton-path";

const shellQuote = (value: string) =>
  /^[\w@%+=:,./-]+$/.test(value)
    ? value
    : `'${value.replaceAll("'", "'\\''")}'`;

/**
 * Builds the command a launch would run without launching anything: the same
 * launch options, wrappers, Proton build and prefix `launchGame` uses.
 */
export const getLaunchPreview = async (
  shop: GameShop,
  objectId: string
): Promise<GameLaunchPreview | null> => {
  const gameKey = levelKeys.game(shop, objectId);
  const game = await gamesSublevel.get(gameKey);
  if (!game?.executablePath) return null;

  const recordedPath = parseExecutablePath(game.executablePath);
  const executablePath = getLaunchExecutable(game, recordedPath);
  const userPreferences = await db
    .get<string, UserPreferences | null>(levelKeys.userPreferences, {
      valueEncoding: "json",
    })
    .catch(() => null);

  const { additions, useMangohud, useGamemode, launchOptions } =
    await resolveGameLaunchOptions({
      objectId,
      gameKey,
      game,
      executablePath,
      userPreferences,
      gameLaunchOptions: game.launchOptions,
      prepareMissing: false,
      writeMangoHudConfig: false,
    });
  const workingDirectory = path.dirname(executablePath);
  const base = {
    executablePath,
    redirectedFrom: executablePath === recordedPath ? null : recordedPath,
    workingDirectory,
    launchOptions,
    rules: additions.rules,
    useMangohud,
    useGamemode,
    conflictingWrappers: findConflictingWrappers(launchOptions),
  };

  if (
    shop === "steam" &&
    /[\\/]steamapps[\\/]common[\\/]/i.test(executablePath)
  ) {
    return {
      ...base,
      runner: "steam",
      commandLine: `steam steam://rungameid/${objectId}`,
      env: {},
      protonPath: null,
      protonSource: null,
      winePrefixPath: null,
    };
  }

  const isProton =
    process.platform === "linux" &&
    path.extname(executablePath).toLowerCase() === ".exe";

  if (isProton) {
    const proton = await resolveGameProton(game, additions.protonPath);
    const winePrefixPath = await Wine.resolvePrefixPath(
      Wine.getEffectivePrefixPath(game.winePrefixPath, objectId)
    );
    const command = Umu.buildLaunchCommand(executablePath, [], {
      winePrefixPath,
      protonPath: proton.path,
      gameId: objectId,
      launchOptions,
      useGamemode,
      useMangohud,
    });

    return {
      ...base,
      runner: "proton",
      commandLine: command.commandLine,
      env: command.env,
      protonPath: proton.path,
      protonSource: proton.source ?? "umu",
      winePrefixPath,
    };
  }

  const command = resolveLaunchCommand({
    baseCommand: executablePath,
    launchOptions,
    wrapperCommands: [
      ...(useGamemode ? ["gamemoderun"] : []),
      ...(useMangohud ? ["mangohud"] : []),
    ],
  });
  const env = Object.entries(command.env)
    .map(([key, value]) => `${key}=${shellQuote(value)}`)
    .join(" ");

  return {
    ...base,
    runner: "native",
    commandLine: [env, ...[command.command, ...command.args].map(shellQuote)]
      .filter(Boolean)
      .join(" "),
    env: command.env,
    protonPath: null,
    protonSource: null,
    winePrefixPath: null,
  };
};
