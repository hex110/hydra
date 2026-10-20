import { registerEvent } from "../register-event";
import { gamesSublevel, levelKeys } from "@main/level";
import { logger } from "@main/services";
import { assignGameCollections } from "@main/services/local-collections";
import type { GameShop } from "@types";

const assignGameToCollection = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  collectionIds: string[]
) => {
  const gameKey = levelKeys.game(shop, objectId);
  const game = await gamesSublevel.get(gameKey);

  if (!game) {
    throw new Error("game/not-found-local");
  }

  try {
    await assignGameCollections(game, collectionIds);
  } catch (error) {
    logger.error("Failed to assign game to collection", error);
    throw new Error(`Failed to assign game to collection: ${error}`);
  }
};

registerEvent("assignGameToCollection", assignGameToCollection);
