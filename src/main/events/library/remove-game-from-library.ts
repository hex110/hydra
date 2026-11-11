import { registerEvent } from "../register-event";
import { db, gamesSublevel, levelKeys } from "@main/level";
import { removeLibraryGame } from "@main/helpers/remove-library-game";
import { applyUserPreferences } from "../user-preferences/update-user-preferences";
import type { GameShop, UserPreferences } from "@types";

/** Adds the game's executable to the scan ignore list so a scan can't re-add it. */
const ignoreGameExecutable = async (shop: GameShop, objectId: string) => {
  const game = await gamesSublevel.get(levelKeys.game(shop, objectId));
  if (!game?.executablePath) return;

  const preferences = await db
    .get<
      string,
      UserPreferences | null
    >(levelKeys.userPreferences, { valueEncoding: "json" })
    .catch(() => null);
  const ignored = preferences?.libraryScanIgnoredFolders ?? [];
  if (ignored.includes(game.executablePath)) return;

  await applyUserPreferences({
    libraryScanIgnoredFolders: [...ignored, game.executablePath],
  });
};

const removeGameFromLibrary = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  options?: { ignoreExecutable?: boolean }
) => {
  if (options?.ignoreExecutable) await ignoreGameExecutable(shop, objectId);
  await removeLibraryGame(shop, objectId);
};

registerEvent("removeGameFromLibrary", removeGameFromLibrary);
