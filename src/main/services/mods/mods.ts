import fs from "node:fs";
import path from "node:path";

import { db, gamesSublevel, levelKeys } from "@main/level";
import { findModUpdate } from "@shared";
import type {
  GameShop,
  InstalledMod,
  ModActionResult,
  ModInstallProgress,
  NexusGameMatch,
  UserPreferences,
} from "@types";

import { downloadToFile } from "../download-to-file";
import { logger } from "../logger";
import { WindowManager } from "../window-manager";
import { ModError, ModStore } from "./mod-store";
import {
  findNexusGame,
  getNexusModFiles,
  getNexusModRequirements,
} from "./nexus";
import { requestNexusFileThroughTorBox } from "./torbox-nexus";

const toError = (error: unknown): ModActionResult => {
  if (error instanceof ModError) return { ok: false, error: error.code };
  logger.error("[Mods] Action failed", error);
  return { ok: false, error: "failed" };
};

export const runModAction = async (
  action: () => Promise<unknown>
): Promise<ModActionResult> => {
  try {
    await action();
    return { ok: true };
  } catch (error) {
    return toError(error);
  }
};

const sendProgress = (progress: ModInstallProgress | null, key: string) =>
  WindowManager.sendToAppWindows("on-mod-install-progress", progress, key);

const readTorBoxToken = async () => {
  const preferences = await db
    .get<string, UserPreferences | null>(levelKeys.userPreferences, {
      valueEncoding: "json",
    })
    .catch(() => null);
  return preferences?.torBoxApiToken ?? null;
};

export const hasTorBoxToken = async () => Boolean(await readTorBoxToken());

/** The game's Nexus match, found by title the first time it is asked for. */
export const getNexusGameForLibraryGame = async (
  shop: GameShop,
  objectId: string
): Promise<NexusGameMatch | null> => {
  const mods = await ModStore.getGameMods(shop, objectId);
  if (mods.nexusGame) return mods.nexusGame;
  const game = await gamesSublevel.get(levelKeys.game(shop, objectId));
  if (!game) return null;
  const match = await findNexusGame(game.title).catch((error) => {
    logger.warn("[Mods] Could not look the game up on Nexus Mods", error);
    return null;
  });
  if (match) await ModStore.setNexusGame(shop, objectId, match);
  return match;
};

export const installNexusModFile = async (
  shop: GameShop,
  objectId: string,
  file: {
    modId: number;
    fileId: number;
    name: string;
    version: string | null;
    replaces?: string;
  }
): Promise<ModActionResult> => {
  const key = `nexus:${file.modId}:${file.fileId}`;
  const progress = (stage: ModInstallProgress["stage"], value: number | null) =>
    sendProgress({ shop, objectId, key, stage, progress: value }, key);

  let downloaded: string | null = null;
  try {
    const nexusGame = await getNexusGameForLibraryGame(shop, objectId);
    if (!nexusGame) return { ok: false, error: "failed" };
    const token = await readTorBoxToken();
    if (!token) return { ok: false, error: "no-torbox" };

    progress("requesting", null);
    const link = await requestNexusFileThroughTorBox(token, {
      gameDomain: nexusGame.domainName,
      modId: file.modId,
      fileId: file.fileId,
    }).catch((error) => {
      logger.error("[Mods] TorBox could not fetch the Nexus file", error);
      return null;
    });
    if (!link) return { ok: false, error: "torbox-failed" };

    progress("downloading", 0);
    downloaded = path.join(
      ModStore.downloadFolder(shop, objectId),
      `${file.fileId}-${link.fileName.replaceAll(/[/\\]/g, "_")}`
    );
    const ok = await downloadToFile(link.url, downloaded, (loaded, total) =>
      progress("downloading", total ? loaded / total : null)
    ).then(
      () => true,
      (error) => {
        logger.error("[Mods] Download failed", error);
        return false;
      }
    );
    if (!ok) return { ok: false, error: "download-failed" };

    progress("installing", null);
    const requirements = await getNexusModRequirements(
      nexusGame.id,
      file.modId
    ).catch((error) => {
      logger.warn("[Mods] Could not read the mod's requirements", error);
      return undefined;
    });
    await ModStore.installFromFile(shop, objectId, downloaded, {
      requirements,
      name: file.name,
      version: file.version,
      replaces: file.replaces,
      source: {
        kind: "nexus",
        gameDomain: nexusGame.domainName,
        gameId: nexusGame.id,
        modId: file.modId,
        fileId: file.fileId,
      },
    });
    return { ok: true };
  } catch (error) {
    return toError(error);
  } finally {
    sendProgress(null, key);
    if (downloaded) await fs.promises.rm(downloaded, { force: true });
  }
};

export const installModFromArchive = (
  shop: GameShop,
  objectId: string,
  filePath: string
) =>
  runModAction(() =>
    ModStore.installFromFile(shop, objectId, filePath, {
      name: path.basename(filePath).replace(/\.(zip|7z|rar|tar(\.\w+)?)$/i, ""),
      version: null,
      source: { kind: "file", fileName: path.basename(filePath) },
    })
  );

/** Marks each Nexus mod with a newer main file; returns how many have one. */
export const checkModUpdates = async (shop: GameShop, objectId: string) => {
  const { mods } = await ModStore.getGameMods(shop, objectId);
  const updates = new Map<string, InstalledMod["update"]>();
  for (const mod of mods) {
    if (mod.source.kind !== "nexus") continue;
    const source = mod.source;
    const files = await getNexusModFiles(source.gameId, source.modId).catch(
      () => null
    );
    if (!files) continue;
    const newer = findModUpdate(files, source.fileId);
    updates.set(
      mod.id,
      newer
        ? { fileId: newer.fileId, version: newer.version, name: newer.name }
        : null
    );
  }
  await ModStore.setUpdates(shop, objectId, updates);
  return [...updates.values()].filter(Boolean).length;
};
