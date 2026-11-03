import fs from "node:fs";
import path from "node:path";
import { db, downloadsSublevel, gamesSublevel, levelKeys } from "@main/level";
import { getDownloadsPath } from "@main/events/helpers/get-downloads-path";
import { parseExecutablePath } from "@main/events/helpers/parse-executable-path";
import { resolveGameRootForDetection } from "@main/services/optiscaler/game-files";
import { updateGameRecord } from "@main/services/game-record-updater";
import { logger } from "@main/services/logger";
import type {
  Download,
  DownloadRelease,
  Game,
  GameInstalledVersion,
  UserPreferences,
} from "@types";

const isInside = (child: string, parent: string) => {
  const relative = path.relative(parent, child);
  return !!relative && !relative.startsWith("..") && !path.isAbsolute(relative);
};

const isDirectory = (directory: string) => {
  try {
    return fs.statSync(directory).isDirectory();
  } catch {
    return false;
  }
};

/**
 * The folder a game is installed in: its download's folder, the folder
 * directly inside a library folder that holds it, or the executable's folder
 * (followed up out of Unreal Engine's `Binaries/Win64`).
 */
export const resolveInstallDirectory = async (
  game: Game,
  download?: Download | null
): Promise<string | null> => {
  if (!game.executablePath) return null;
  const executablePath = path.resolve(parseExecutablePath(game.executablePath));

  if (download?.folderName) {
    const downloadFolder = path.resolve(
      download.downloadPath,
      download.folderName
    );
    if (isInside(executablePath, downloadFolder) && isDirectory(downloadFolder))
      return downloadFolder;
  }

  const preferences = await db
    .get<string, UserPreferences | null>(levelKeys.userPreferences, {
      valueEncoding: "json",
    })
    .catch(() => null);
  const downloadsPath = await getDownloadsPath().catch(() => null);
  const roots = [
    ...(preferences?.libraryScanDirectories ?? []),
    ...(downloadsPath ? [downloadsPath] : []),
  ].map((root) => path.resolve(root));

  for (const root of roots) {
    if (!isInside(executablePath, root)) continue;
    const [first, ...rest] = path
      .relative(root, executablePath)
      .split(path.sep);
    if (rest.length > 0) return path.join(root, first);
  }

  return resolveGameRootForDetection(path.dirname(executablePath));
};

/** The release recorded for a folder whose name is all Hydra knows. */
const fromFolder = (directory: string): GameInstalledVersion => ({
  title: path.basename(directory),
  downloadSourceId: null,
  downloadSourceName: null,
  uploadDate: null,
  fileSize: null,
  uris: [],
  directory,
  origin: "folder",
  recordedAt: new Date().toISOString(),
});

export const toInstalledVersion = (
  release: DownloadRelease,
  directory: string | null,
  origin: GameInstalledVersion["origin"]
): GameInstalledVersion => ({
  ...release,
  directory,
  origin,
  recordedAt: new Date().toISOString(),
});

/**
 * Records which release is installed when Hydra does not know yet, or when
 * the game moved to another folder. A download's release is used when the
 * game was installed from it; otherwise the folder name stands in.
 */
export const ensureInstalledVersion = async (gameKey: string) => {
  const [game, download] = await Promise.all([
    gamesSublevel.get(gameKey),
    downloadsSublevel.get(gameKey),
  ]);
  if (!game?.executablePath || game.isDeleted) return;
  if (game.hasActiveSteamImport || game.epicInstallation) return;

  const directory = await resolveInstallDirectory(game, download);
  if (!directory) return;

  const recorded = game.installedVersion;
  if (recorded && (!recorded.directory || recorded.directory === directory)) {
    return;
  }

  const downloadFolder = download?.folderName
    ? path.resolve(download.downloadPath, download.folderName)
    : null;
  const installedVersion =
    download?.release && downloadFolder === directory
      ? toInstalledVersion(download.release, directory, "download")
      : fromFolder(directory);

  await updateGameRecord(gameKey, {
    installedVersion,
    availableUpdate: null,
  });
  logger.info("[GameUpdates] Recorded installed version", {
    gameKey,
    title: installedVersion.title,
    origin: installedVersion.origin,
  });
};

/**
 * A download extracted into the folder the game is installed in replaced its
 * files, so its release is the installed one now. This covers an update
 * downloaded as a plain download that happens to unpack into the install
 * folder; an update installed in place records its release itself.
 */
export const recordDownloadedRelease = async (gameKey: string) => {
  const [game, download] = await Promise.all([
    gamesSublevel.get(gameKey),
    downloadsSublevel.get(gameKey),
  ]);
  const recorded = game?.installedVersion;
  if (!game || !recorded?.directory || !download?.release || download.update) {
    return;
  }
  if (recorded.title === download.release.title) return;

  const directory = await resolveInstallDirectory(game, download);
  if (!directory) return;

  const downloadFolder = download.folderName
    ? path.resolve(download.downloadPath, download.folderName)
    : null;
  if (downloadFolder !== directory) return;

  // The recorded folder is the one just replaced, or a folder inside it.
  if (
    path.resolve(recorded.directory) !== directory &&
    !isInside(path.resolve(recorded.directory), directory)
  ) {
    return;
  }

  const installedVersion = toInstalledVersion(
    download.release,
    directory,
    "download"
  );
  await updateGameRecord(gameKey, {
    installedVersion,
    availableUpdate:
      game.availableUpdate?.release.title === installedVersion.title
        ? null
        : (game.availableUpdate ?? null),
  });
  logger.info("[GameUpdates] Recorded the downloaded release as installed", {
    gameKey,
    title: installedVersion.title,
  });
};

/**
 * The release and update target to store on a new download. The current
 * download record is read before the new one replaces it, since it is what
 * locates the installed folder.
 */
export const getDownloadUpdateFields = async (
  gameKey: string,
  release: DownloadRelease | null | undefined,
  updateInPlace: boolean | undefined
): Promise<Pick<Download, "release" | "update">> => {
  if (!updateInPlace) return { release: release ?? null, update: null };

  const [game, download] = await Promise.all([
    gamesSublevel.get(gameKey),
    downloadsSublevel.get(gameKey),
  ]);
  const installDirectory =
    game && (await resolveInstallDirectory(game, download));

  return {
    release: release ?? null,
    update:
      game?.executablePath && installDirectory
        ? {
            installDirectory,
            executablePath: path.resolve(
              parseExecutablePath(game.executablePath)
            ),
          }
        : null,
  };
};
