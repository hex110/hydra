import fs from "node:fs";
import path from "node:path";

import type {
  Game,
  GameShop,
  GameUninstallPlan,
  UserPreferences,
} from "@types";
import { db, downloadsSublevel, gamesSublevel, levelKeys } from "@main/level";
import { getDownloadsPath } from "@main/events/helpers/get-downloads-path";
import { getDirectorySize } from "@main/events/helpers/get-directory-size";
import { parseExecutablePath } from "@main/events/helpers/parse-executable-path";
import { isGameRunning } from "@main/services/game-running-state";
import { updateGameRecord } from "@main/services/game-record-updater";
import { logger } from "@main/services/logger";
import { getSteamLibraryFolders } from "@main/services/steam";
import { SystemPath } from "@main/services/system-path";
import { Wine } from "@main/services/wine";

import {
  planFolderUninstall,
  type FolderUninstallError,
  type FolderUninstallPlan,
} from "./folder-uninstall-plan";

const realPath = (target: string) =>
  fs.promises.realpath(target).catch(() => path.resolve(target));

const isWithin = (child: string, parent: string) => {
  const relative = path.relative(parent, child);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
};

const resolveExecutable = async (game: Game) =>
  game.executablePath
    ? realPath(parseExecutablePath(game.executablePath))
    : null;

const resolvePrefix = async (
  game: Pick<Game, "winePrefixPath">,
  objectId: string
) =>
  process.platform === "linux"
    ? Wine.resolvePrefixPath(
        Wine.getEffectivePrefixPath(game.winePrefixPath, objectId)
      )
    : null;

const buildPlan = async (
  shop: GameShop,
  objectId: string
): Promise<
  | { ok: true; plan: FolderUninstallPlan; game: Game; executable: string }
  | { ok: false; error: FolderUninstallError | "has-download" }
> => {
  const gameKey = levelKeys.game(shop, objectId);
  const game = await gamesSublevel.get(gameKey).catch(() => null);
  if (!game?.executablePath) return { ok: false, error: "no-executable" };
  if (await downloadsSublevel.get(gameKey).catch(() => null)) {
    return { ok: false, error: "has-download" };
  }

  const executable = (await resolveExecutable(game))!;
  const preferences = await db
    .get<string, UserPreferences | null>(levelKeys.userPreferences, {
      valueEncoding: "json",
    })
    .catch(() => null);
  const downloadsPath = await getDownloadsPath().catch(() => null);
  const libraryRoots = await Promise.all(
    [
      ...(preferences?.libraryScanDirectories ?? []),
      ...(downloadsPath ? [downloadsPath] : []),
    ].map(realPath)
  );
  const steamLibraries = await Promise.all(
    (await getSteamLibraryFolders().catch(() => [] as string[])).map(realPath)
  );

  const otherExecutables: string[] = [];
  const otherPrefixes: string[] = [];
  for (const [key, other] of await gamesSublevel.iterator().all()) {
    if (key === gameKey || !other.executablePath) continue;
    const otherExecutable = await resolveExecutable(other);
    // Another record of the same install (a grouped store entry) isn't a second game.
    if (!otherExecutable || otherExecutable === executable) continue;
    otherExecutables.push(otherExecutable);
    const otherPrefix = await resolvePrefix(other, other.objectId);
    if (otherPrefix) otherPrefixes.push(otherPrefix);
  }

  const defaultPrefixRoot = Wine.getDefaultPrefixPath();
  const result = await planFolderUninstall({
    executablePath: executable,
    libraryRoots,
    steamLibraries,
    prefixPath: await resolvePrefix(game, objectId),
    defaultPrefixRoot: defaultPrefixRoot
      ? await realPath(defaultPrefixRoot)
      : null,
    otherExecutables,
    otherPrefixes,
    homeDir: await realPath(SystemPath.getPath("home")),
  });

  return result.ok ? { ...result, game, executable } : result;
};

export const getGameUninstallPlan = async (
  shop: GameShop,
  objectId: string
): Promise<GameUninstallPlan> => {
  const result = await buildPlan(shop, objectId);
  if (!result.ok) return { ok: false, error: result.error };

  const { folder, prefix } = result.plan;
  const prefixInsideFolder = prefix !== null && isWithin(prefix, folder);
  const folderInsidePrefix = prefix !== null && isWithin(folder, prefix);
  return {
    ok: true,
    folder: {
      path: folder,
      sizeInBytes: await getDirectorySize(folder),
    },
    prefix:
      prefix && !prefixInsideFolder
        ? {
            path: prefix,
            sizeInBytes: folderInsidePrefix
              ? null
              : await getDirectorySize(prefix),
            holdsGame: folderInsidePrefix,
          }
        : null,
  };
};

/**
 * Deletes a game Hydra didn't download. The plan is built again and must match
 * what the user confirmed, so a changed library never widens the deletion.
 */
export const uninstallGameFolder = async (
  shop: GameShop,
  objectId: string,
  confirmed: { folder: string; prefix: string | null }
): Promise<{ ok: true } | { ok: false; error: string }> => {
  if (isGameRunning(objectId, shop))
    return { ok: false, error: "game-running" };

  const result = await buildPlan(shop, objectId);
  if (!result.ok) return { ok: false, error: result.error };

  const { folder, prefix } = result.plan;
  if (
    folder !== confirmed.folder ||
    (confirmed.prefix !== null && confirmed.prefix !== prefix)
  ) {
    return { ok: false, error: "target-changed" };
  }

  const deletePrefix = prefix !== null && confirmed.prefix === prefix;
  const targets = [
    folder,
    ...(deletePrefix && !isWithin(prefix, folder) ? [prefix] : []),
  ];

  logger.info("[Uninstall] Deleting game files", {
    game: result.game.title,
    targets,
  });

  for (const target of targets) {
    await fs.promises.rm(target, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  }

  for (const [key, record] of await gamesSublevel.iterator().all()) {
    if (!record.executablePath) continue;
    const recordExecutable = await resolveExecutable(record);
    if (!recordExecutable || !isWithin(recordExecutable, folder)) continue;
    await updateGameRecord(key, (current) => ({
      executablePath: null,
      installedSizeInBytes: null,
      automaticCloudSync: false,
      ...(current.discs && {
        discs: current.discs.filter(
          (disc) => !isWithin(path.resolve(disc.path), folder)
        ),
      }),
    }));
  }

  return { ok: true };
};
