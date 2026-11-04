import fs from "node:fs";
import path from "node:path";

import { shell } from "electron";

import { gamesSublevel, levelKeys } from "@main/level";
import { MOD_REPORT_ACTIVITY_LINES, formatModReport } from "@shared";
import type { GameShop, ModFolderKind, ModsOverview } from "@types";

import { canRunAutomaticCloudSaveSync } from "../cloud-save/automatic-sync";
import { syncGameCloudSave } from "../cloud-save/sync-game-cloud-save";
import { GameRuns } from "../game-runs/game-runs";
import { logger } from "../logger";
import { SystemPath } from "../system-path";
import { ModActivity } from "./activity";
import {
  ModError,
  ModStore,
  resolveModSupport,
  resolveModGameFolder,
} from "./mod-store";
import { isNxmHandler } from "./nxm";
import { readTorBoxToken } from "./mods";
import { getTorBoxNexusLimit } from "./torbox-nexus";

const loadGame = async (shop: GameShop, objectId: string) => {
  const game = await gamesSublevel
    .get(levelKeys.game(shop, objectId))
    .catch(() => null);
  if (!game) throw new ModError("not-found");
  return game;
};

export const buildModReport = async (shop: GameShop, objectId: string) => {
  const game = await loadGame(shop, objectId);
  const [state, deployed, activity] = await Promise.all([
    ModStore.readState(shop, objectId),
    ModStore.getDeployedSummary(shop, objectId),
    ModActivity.read(shop, objectId, MOD_REPORT_ACTIVITY_LINES),
  ]);
  return formatModReport({
    generatedAt: new Date().toISOString(),
    game: {
      title: game.title,
      shop,
      objectId,
      executablePath: game.executablePath ?? null,
      protonPath: game.protonPath ?? null,
      winePrefixPath: game.winePrefixPath ?? null,
    },
    gameFolder: resolveModGameFolder(game.executablePath ?? null),
    storeFolder: ModStore.storeFolder(shop, objectId),
    support: resolveModSupport(state.nexusGame?.domainName),
    nexusGame: state.nexusGame,
    profileName: state.profileName,
    playMode: state.playMode,
    loader: null,
    mods: state.mods,
    overridden: state.overridden,
    deployed,
    lastRun: GameRuns.getLatest(shop, objectId),
    loaderErrors: [],
    activity,
  });
};

/** Writes the report next to the game's mods and shows it in the file manager. */
export const saveModReport = async (shop: GameShop, objectId: string) => {
  const report = await buildModReport(shop, objectId);
  const folder = path.join(ModStore.storeFolder(shop, objectId), "reports");
  await fs.promises.mkdir(folder, { recursive: true });
  const filePath = path.join(
    folder,
    `mods-report-${new Date()
      .toISOString()
      .replaceAll(":", "-")
      .replace(/\.\d+Z$/, "Z")}.md`
  );
  await fs.promises.writeFile(filePath, report);
  shell.showItemInFolder(filePath);
  return filePath;
};

export const openModFolder = async (
  shop: GameShop,
  objectId: string,
  kind: ModFolderKind
) => {
  let target: string | null;
  if (kind === "store") target = ModStore.storeFolder(shop, objectId);
  else if (kind === "staging") target = ModStore.stagingRoot(shop, objectId);
  else {
    const game = await loadGame(shop, objectId);
    const gameFolder = resolveModGameFolder(game.executablePath ?? null);
    const { nexusGame } = await ModStore.readState(shop, objectId);
    const modFolder = resolveModSupport(nexusGame?.domainName).modFolder;
    target = gameFolder ? path.join(gameFolder, modFolder) : null;
    // The mod folder may not exist until a mod is deployed.
    if (target && !fs.existsSync(target)) target = gameFolder;
  }
  if (!target) return false;
  await fs.promises.mkdir(target, { recursive: true });
  const error = await shell.openPath(target);
  if (error) logger.warn("[Mods] Could not open a folder", { target, error });
  return !error;
};

/** Bytes under a folder, each hard-linked file counted once. */
const folderSize = async (root: string, seen = new Set<string>()) => {
  let total = 0;
  const entries = await fs.promises
    .readdir(root, { withFileTypes: true })
    .catch(() => [] as fs.Dirent[]);
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) total += await folderSize(entryPath, seen);
    else if (entry.isFile()) {
      const stats = await fs.promises.stat(entryPath).catch(() => null);
      if (!stats) continue;
      const inode = `${stats.dev}:${stats.ino}`;
      if (seen.has(inode)) continue;
      seen.add(inode);
      total += stats.size;
    }
  }
  return total;
};

export const getModsOverview = async (): Promise<ModsOverview> => {
  const storagePath = path.join(SystemPath.getPath("userData"), "mods");
  const shops = await fs.promises
    .readdir(storagePath, { withFileTypes: true })
    .catch(() => [] as fs.Dirent[]);
  let games = 0;
  for (const shop of shops.filter((entry) => entry.isDirectory()))
    games += (
      await fs.promises
        .readdir(path.join(storagePath, shop.name))
        .catch(() => [] as string[])
    ).length;

  const token = await readTorBoxToken();
  const limit = token
    ? await getTorBoxNexusLimit(token).catch((error) => {
        logger.warn("[Mods] Could not read TorBox's Nexus limit", error);
        return null;
      })
    : null;

  return {
    storagePath,
    storageBytes: await folderSize(storagePath),
    games,
    torBox: {
      connected: Boolean(token),
      nexusLinksLeft: limit ? Math.max(0, limit.limit - limit.used) : null,
      nexusLinksLimit: limit?.limit ?? null,
    },
    isNxmHandler: isNxmHandler(),
  };
};

/**
 * Whether to offer a save backup before this launch: the game starts modded
 * with mods on, save backups are set up for it, and it was not offered yet.
 */
export const shouldOfferSaveBackup = async (
  shop: GameShop,
  objectId: string
) => {
  const state = await ModStore.readState(shop, objectId);
  if (state.saveBackupOffered || state.playMode !== "modded") return false;
  if (!state.mods.some((mod) => mod.enabled)) return false;
  return canRunAutomaticCloudSaveSync(objectId, shop).catch(() => false);
};

/** Answers the offer: backs the saves up when asked; never asks again. */
export const answerSaveBackupOffer = async (
  shop: GameShop,
  objectId: string,
  backUp: boolean
) => {
  await ModStore.markSaveBackupOffered(shop, objectId);
  if (!backUp) {
    await ModActivity.append(shop, objectId, {
      kind: "save-backup",
      message: "Skipped the save backup before the first modded launch.",
    });
    return true;
  }
  try {
    const result = await syncGameCloudSave(objectId, shop, "manual");
    await ModActivity.append(shop, objectId, {
      kind: "save-backup",
      message: `Backed up the saves before the first modded launch (${result.action}).`,
    });
    return result.action !== "conflict";
  } catch (error) {
    logger.warn("[Mods] Save backup before modding failed", error);
    await ModActivity.append(shop, objectId, {
      kind: "error",
      message: `The save backup before the first modded launch failed: ${error instanceof Error ? error.message : String(error)}`,
    });
    return false;
  }
};
