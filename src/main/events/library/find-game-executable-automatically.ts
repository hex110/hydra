import { registerEvent } from "../register-event";
import { downloadsSublevel, gamesSublevel, levelKeys } from "@main/level";
import { GameFilesManager, logger, Wine, WindowManager } from "@main/services";
import type { GameShop } from "@types";

// Looks in the download folder, then in the folders installers write to
// (the game's Wine prefix on Linux). With no recorded installer run, every
// folder counts and only one named like the game is trusted.
const findGameExecutableAutomatically = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string
): Promise<boolean> => {
  const gameKey = levelKeys.game(shop, objectId);
  const [download, game] = await Promise.all([
    downloadsSublevel.get(gameKey),
    gamesSublevel.get(gameKey).catch(() => null),
  ]);

  if (game?.executablePath) return true;

  const found = await new GameFilesManager(
    shop,
    objectId
  ).searchAndBindInstalledExecutable(
    download?.installerStartedAt ?? 0,
    Wine.getEffectivePrefixPath(game?.winePrefixPath, objectId)
  );

  logger.info(
    `[GameInstaller] Automatic search for ${objectId}: ${found ? "found" : "nothing found"}`
  );
  if (found) WindowManager.sendToAppWindows("on-library-batch-complete");

  return found;
};

registerEvent(
  "findGameExecutableAutomatically",
  findGameExecutableAutomatically
);
