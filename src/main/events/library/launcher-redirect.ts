import { gamesSublevel, levelKeys } from "@main/level";
import { findLauncherRedirect } from "@main/helpers/launcher-redirects";
import { updateGameRecord } from "@main/services/game-record-updater";
import type { GameShop } from "@types";
import { parseExecutablePath } from "../helpers/parse-executable-path";
import { registerEvent } from "../register-event";

/** The game a launcher executable starts, whether or not the game uses it. */
const getGameLauncherRedirect = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string
) => {
  const game = await gamesSublevel.get(levelKeys.game(shop, objectId));
  if (!game?.executablePath) return null;

  const launcherPath = parseExecutablePath(game.executablePath);
  const gamePath = findLauncherRedirect(launcherPath);
  return gamePath ? { launcherPath, gamePath } : null;
};

const setGameUseLauncher = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  useLauncher: boolean
) => {
  await updateGameRecord(levelKeys.game(shop, objectId), {
    useGameLauncher: useLauncher,
  });
};

registerEvent("getGameLauncherRedirect", getGameLauncherRedirect);
registerEvent("setGameUseLauncher", setGameUseLauncher);
