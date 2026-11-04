import fs from "node:fs";
import path from "node:path";

import { parseExecutablePath } from "@main/events/helpers/parse-executable-path";
import {
  HYDRA_GAME_SUPPORT,
  MOD_FOLDERS,
  detectUnityRuntime,
  matchGameSupport,
  unityGameSupport,
} from "@shared";
import type { Game, GameSupportDefinition } from "@types";

import { ThunderstoreGames } from "./thunderstore";

export { ThunderstoreGames, resolveThunderstoreLoader } from "./thunderstore";

/** Lower-case names in a folder; empty when it can't be read. */
export const readRootEntries = async (folder: string) =>
  new Set(
    (await fs.promises.readdir(folder).catch(() => [] as string[])).map(
      (entry) => entry.toLowerCase()
    )
  );

/**
 * What Hydra knows about modding a game, most specific first: a definition
 * written for it, Thunderstore's data, the mod folder table (as a fallback,
 * so null here), then what the game folder shows (a Unity game takes
 * BepInEx). Null means Hydra only knows where files go.
 */
export const resolveGameSupportDefinition = async ({
  game,
  gameFolder,
  nexusDomain,
}: {
  game: Pick<Game, "shop" | "objectId" | "executablePath">;
  gameFolder: string | null;
  nexusDomain: string | null;
}): Promise<GameSupportDefinition | null> => {
  const exeName = game.executablePath
    ? path.basename(parseExecutablePath(game.executablePath))
    : null;
  const lookup = {
    steamAppId: game.shop === "steam" ? game.objectId : null,
    nexusDomain,
    exeName,
  };

  const written = matchGameSupport(HYDRA_GAME_SUPPORT, lookup);
  if (written) return written;
  const thunderstore = matchGameSupport(await ThunderstoreGames.list(), lookup);
  if (thunderstore) return thunderstore;
  if (nexusDomain && nexusDomain in MOD_FOLDERS) return null;

  if (!gameFolder || !exeName) return null;
  const rootEntries = await readRootEntries(gameFolder);
  const dataFolder = `${exeName.replace(/\.exe$/i, "")}_Data`;
  const runtime = detectUnityRuntime({
    rootEntries,
    exeName,
    hasManagedFolder: fs.existsSync(
      path.join(gameFolder, dataFolder, "Managed")
    ),
  });
  return runtime ? unityGameSupport(runtime) : null;
};
