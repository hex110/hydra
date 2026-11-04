import path from "node:path";

import { db, gamesSublevel, levelKeys } from "@main/level";
import { findModUpdate } from "@shared";
import type {
  GameShop,
  InstalledMod,
  ModActionResult,
  NexusGameMatch,
  UserPreferences,
} from "@types";

import { logger } from "../logger";
import { ModActivity } from "./activity";
import { ModDownloads, type NexusFileRequest } from "./mod-downloads";
import { ModError, ModStore } from "./mod-store";
import { findNexusGame, getNexusModFiles } from "./nexus";

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

const readTorBoxToken = async () => {
  const preferences = await db
    .get<string, UserPreferences | null>(levelKeys.userPreferences, {
      valueEncoding: "json",
    })
    .catch(() => null);
  return preferences?.torBoxApiToken ?? null;
};

export const hasTorBoxToken = async () => Boolean(await readTorBoxToken());

export { readTorBoxToken };

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

/**
 * Queues a Nexus file in the Downloads queue. Resolves once it is queued;
 * `finished` settles when it is installed or has failed.
 */
export const queueNexusModFile = async (
  shop: GameShop,
  objectId: string,
  file: NexusFileRequest
) => {
  const nexusGame = await getNexusGameForLibraryGame(shop, objectId);
  if (!nexusGame) return { result: toError(new ModError("not-found")) };
  if (!(await readTorBoxToken()))
    return { result: { ok: false, error: "no-torbox" } as ModActionResult };
  const queued = await ModDownloads.enqueue(shop, objectId, file);
  return { result: { ok: true } as ModActionResult, finished: queued.finished };
};

export const installNexusModFile = async (
  shop: GameShop,
  objectId: string,
  file: NexusFileRequest
): Promise<ModActionResult> =>
  (await queueNexusModFile(shop, objectId, file)).result;

export const installModFromArchive = async (
  shop: GameShop,
  objectId: string,
  filePath: string
) => {
  const result = await runModAction(async () => {
    const installed = await ModStore.installFromFile(shop, objectId, filePath, {
      name: path.basename(filePath).replace(/\.(zip|7z|rar|tar(\.\w+)?)$/i, ""),
      version: null,
      source: { kind: "file", fileName: path.basename(filePath) },
    });
    if (installed?.needsLoader)
      await ModDownloads.ensureLoader(shop, objectId, installed.name);
  });
  if (!result.ok)
    await ModActivity.append(shop, objectId, {
      kind: "error",
      modName: path.basename(filePath),
      message: `Could not install ${path.basename(filePath)}: ${result.error}`,
    });
  return result;
};

/** Queues the game's loader from the Mods page's "is needed" row. */
export const installModLoader = async (
  shop: GameShop,
  objectId: string
): Promise<ModActionResult> => {
  try {
    const { mods } = await ModStore.readState(shop, objectId);
    const off = mods.find((mod) => mod.loader && !mod.enabled);
    if (off) {
      await ModStore.setEnabled(shop, objectId, off.id, true);
      return { ok: true };
    }
    const queued = await ModDownloads.ensureLoader(shop, objectId, null);
    return queued ? { ok: true } : { ok: false, error: "no-loader-package" };
  } catch (error) {
    return toError(error);
  }
};

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
