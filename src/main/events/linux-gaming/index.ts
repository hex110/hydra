import fs from "node:fs";
import path from "node:path";
import { db, gamesSublevel, levelKeys } from "@main/level";
import { parseExecutablePath } from "@main/events/helpers/parse-executable-path";
import { getDirectorySize } from "@main/events/helpers/get-directory-size";
import { getLaunchAdditions } from "@main/helpers/launch-additions";
import { resolveGameProton } from "@main/helpers/resolve-proton-path";
import { GameSetup } from "@main/services/game-setup";
import { isGameRunning } from "@main/services/game-running-state";
import { updateGameRecord } from "@main/services/game-record-updater";
import { logger } from "@main/services/logger";
import { ProtonManager } from "@main/services/proton-manager";
import { Umu } from "@main/services/umu";
import { Wine } from "@main/services/wine";
import { WindowManager } from "@main/services/window-manager";
import { refreshExecutableStatus } from "@main/services/executable-status";
import type {
  GameShop,
  MangoHudSettings,
  ProtonFlavor,
  UserPreferences,
  WinePrefixInfo,
} from "@types";
import { registerEvent } from "../register-event";

const getGame = async (shop: GameShop, objectId: string) => {
  const game = await gamesSublevel.get(levelKeys.game(shop, objectId));
  if (!game) throw new Error("Game not found");
  return game;
};

const getPrefixPath = async (shop: GameShop, objectId: string) => {
  const game = await getGame(shop, objectId);
  return {
    game,
    prefixPath: await Wine.resolvePrefixPath(
      Wine.getEffectivePrefixPath(game.winePrefixPath, objectId)
    ),
  };
};

const getProtonOverview = (
  _event: Electron.IpcMainInvokeEvent,
  force?: boolean
) => ProtonManager.getOverview(force === true);

const installProton = async (
  _event: Electron.IpcMainInvokeEvent,
  flavor: ProtonFlavor,
  tag?: string
) => {
  try {
    return {
      ok: true as const,
      path: await ProtonManager.install(flavor, tag),
    };
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : String(error),
    };
  }
};

const getProtonUsage = (
  _event: Electron.IpcMainInvokeEvent,
  protonPath: string
) => ProtonManager.getUsage(protonPath);

const removeProton = (
  _event: Electron.IpcMainInvokeEvent,
  protonPath: string
) => ProtonManager.remove(protonPath);

const getGameWinePrefixInfo = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string
): Promise<WinePrefixInfo> => {
  const { prefixPath } = await getPrefixPath(shop, objectId);
  const exists = !!prefixPath && fs.existsSync(prefixPath);
  return {
    path: prefixPath,
    exists,
    sizeInBytes: exists ? await getDirectorySize(prefixPath!) : null,
  };
};

const openGameWinecfg = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string
) => {
  const { game, prefixPath } = await getPrefixPath(shop, objectId);
  if (!prefixPath || !game.executablePath) return false;

  const additions = await getLaunchAdditions({
    objectId,
    gameKey: levelKeys.game(shop, objectId),
    game,
    executablePath: parseExecutablePath(game.executablePath),
    userPreferences: await db
      .get<string, UserPreferences | null>(levelKeys.userPreferences, {
        valueEncoding: "json",
      })
      .catch(() => null),
    prepareMissing: false,
  });

  try {
    await Umu.runTool("winecfg", {
      winePrefixPath: prefixPath,
      protonPath: (await resolveGameProton(game, additions.protonPath)).path,
      gameId: objectId,
    });
    return true;
  } catch (error) {
    logger.error("Failed to open winecfg", error);
    return false;
  }
};

/** Deletes the game's prefix and creates it again with game setup. */
const resetGameWinePrefix = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string
) => {
  const { game, prefixPath } = await getPrefixPath(shop, objectId);
  if (!prefixPath) return { ok: false as const, error: "no-prefix" };
  if (isGameRunning(objectId, shop)) {
    return { ok: false as const, error: "game-running" };
  }
  // Only folders that look like a prefix are deleted.
  if (
    fs.existsSync(prefixPath) &&
    !fs.existsSync(path.join(prefixPath, "pfx")) &&
    !fs.existsSync(path.join(prefixPath, "drive_c"))
  ) {
    return { ok: false as const, error: "not-a-prefix" };
  }

  logger.info("[Prefix] Resetting", { game: game.title, prefixPath });
  await fs.promises.rm(prefixPath, { recursive: true, force: true });
  await GameSetup.enqueue(shop, objectId, {
    reason: "manual",
    force: true,
    steps: ["wine-prefix", "online-fix"],
  });
  return { ok: true as const };
};

const setGameMangoHud = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string,
  settings: MangoHudSettings | null
) => {
  await updateGameRecord(levelKeys.game(shop, objectId), {
    mangoHud: settings,
  });
};

registerEvent("getProtonOverview", getProtonOverview);
registerEvent("installProton", installProton);
registerEvent("getProtonUsage", getProtonUsage);
registerEvent("removeProton", removeProton);
registerEvent("getGameWinePrefixInfo", getGameWinePrefixInfo);
registerEvent("openGameWinecfg", openGameWinecfg);
registerEvent("resetGameWinePrefix", resetGameWinePrefix);
registerEvent("setGameMangoHud", setGameMangoHud);

/** Checks the game's executable again; returns the new status. */
const checkGameExecutable = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string
) => {
  const game = await getGame(shop, objectId);
  if (await refreshExecutableStatus(game)) {
    WindowManager.sendToAppWindows("on-library-batch-complete");
  }
  return (await getGame(shop, objectId)).executableStatus ?? null;
};

registerEvent("checkGameExecutable", checkGameExecutable);
