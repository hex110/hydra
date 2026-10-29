import path from "node:path";
import { parseExecutablePath } from "@main/events/helpers/parse-executable-path";
import { getLaunchExecutable } from "@main/helpers/launcher-redirects";
import type { Game } from "@types";

/**
 * The Windows executable game-folder mods belong next to, or null for a game
 * that has none. A publisher launcher that starts the game is skipped for the
 * game itself.
 */
export const getWindowsExecutable = (game: Game) => {
  if (!game.executablePath) return null;
  const executablePath = getLaunchExecutable(
    game,
    parseExecutablePath(game.executablePath)
  );
  return path.extname(executablePath).toLowerCase() === ".exe"
    ? executablePath
    : null;
};

/** Games whose files another launcher owns are never touched automatically. */
export const isManagedElsewhere = (game: Game, executablePath: string) =>
  game.hasActiveSteamImport === true ||
  !!game.epicInstallation ||
  /[\\/]steamapps[\\/]common[\\/]/i.test(executablePath);
