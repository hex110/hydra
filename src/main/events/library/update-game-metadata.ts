import { levelKeys } from "@main/level";
import { updateGameRecord } from "@main/services/game-record-updater";
import { WindowManager } from "@main/services/window-manager";
import type { GameMetadataOverrides, GameShop } from "@types";

import { registerEvent } from "../register-event";

const normalizeGenres = (genres: string[] | null | undefined) => {
  if (!genres) return null;
  const unique = Array.from(
    new Set(genres.map((genre) => genre.trim()).filter(Boolean))
  );
  return unique.length > 0 ? unique : null;
};

const updateGameMetadata = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  overrides: GameMetadataOverrides
) => {
  await updateGameRecord(levelKeys.game(shop, objectId), {
    ...(overrides.customDescription !== undefined && {
      customDescription: overrides.customDescription?.trim() || null,
    }),
    ...(overrides.customGenres !== undefined && {
      customGenres: normalizeGenres(overrides.customGenres),
    }),
    ...(overrides.metadataLanguage !== undefined && {
      metadataLanguage: overrides.metadataLanguage || null,
    }),
  });
  WindowManager.sendToAppWindows("on-library-batch-complete");
};

registerEvent("updateGameMetadata", updateGameMetadata);
