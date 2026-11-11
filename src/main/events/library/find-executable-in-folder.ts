import { registerEvent } from "../register-event";
import { findOrGuessGameExecutable } from "@main/helpers/find-game-executable";
import { gamesSublevel, levelKeys } from "@main/level";
import { GameExecutables, logger } from "@main/services";
import type { GameShop } from "@types";

// For a game installed outside Hydra: the user points at its folder and the
// executable inside is found the way a library scan finds one.
const findExecutableInFolder = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  folderPath: string
): Promise<string | null> => {
  const game = await gamesSublevel
    .get(levelKeys.game(shop, objectId))
    .catch(() => null);

  try {
    return await findOrGuessGameExecutable(
      folderPath,
      GameExecutables.getExecutablesForGame(objectId),
      game?.title ?? ""
    );
  } catch (error) {
    logger.error(`Failed to search ${folderPath} for ${objectId}`, error);
    return null;
  }
};

registerEvent("findExecutableInFolder", findExecutableInFolder);
