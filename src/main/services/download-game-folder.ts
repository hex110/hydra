import fs from "node:fs";
import path from "node:path";

import { FILE_EXTENSIONS_TO_EXTRACT } from "../../shared/constants.js";
import type { Download } from "@types";

export type DownloadFolder =
  | { kind: "missing" }
  | { kind: "archive"; archivePath: string }
  | { kind: "file"; filePath: string }
  | {
      kind: "folder";
      folderPath: string;
      /** The archive the folder was unpacked from, when it is still there. */
      archivePath: string | null;
      /** Unpacked by something else than Hydra: `folderName` still names the archive. */
      extractedOutside: boolean;
    };

export type CompletedDownloadState =
  | "play"
  | "extract"
  | "install"
  | "open-folder"
  | "missing";

const isArchive = (filePath: string) =>
  FILE_EXTENSIONS_TO_EXTRACT.some((ext) =>
    filePath.toLowerCase().endsWith(ext)
  );

const isDirectory = (target: string) => {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
};

const hasEntries = (folderPath: string) => {
  try {
    return fs.readdirSync(folderPath).length > 0;
  } catch {
    return false;
  }
};

/**
 * Where a finished download's game files are. Hydra unpacks `game.zip` into
 * `game/` next to it, so a folder like that also counts when the archive is
 * still there or already gone: it was unpacked by hand.
 */
export const resolveDownloadFolder = (
  download: Pick<
    Download,
    "downloadPath" | "folderName" | "extractionFailed" | "extracting"
  >
): DownloadFolder => {
  if (!download.folderName) return { kind: "missing" };

  const target = path.join(download.downloadPath, download.folderName);
  const exists = fs.existsSync(target);

  if (exists && isDirectory(target)) {
    return {
      kind: "folder",
      folderPath: target,
      archivePath: null,
      extractedOutside: false,
    };
  }

  if (exists && !isArchive(target)) return { kind: "file", filePath: target };

  const parsed = path.parse(target);
  const sibling = path.join(parsed.dir, parsed.name);
  // A folder left by a failed or running extraction is not a finished one.
  const mayBeHalfUnpacked =
    exists && (download.extractionFailed || download.extracting);

  if (
    isArchive(target) &&
    !mayBeHalfUnpacked &&
    isDirectory(sibling) &&
    hasEntries(sibling)
  ) {
    return {
      kind: "folder",
      folderPath: sibling,
      archivePath: exists ? target : null,
      extractedOutside: true,
    };
  }

  return exists
    ? { kind: "archive", archivePath: target }
    : { kind: "missing" };
};

/** The installer to run in a game folder: `setup.exe`, or a lone `.exe`. */
export const findInstaller = (folderPath: string): string | null => {
  const setupPath = path.join(folderPath, "setup.exe");
  if (fs.existsSync(setupPath)) return setupPath;

  const executables = fs
    .readdirSync(folderPath)
    .filter((fileName) => path.extname(fileName).toLowerCase() === ".exe");

  return executables.length === 1
    ? path.join(folderPath, executables[0])
    : null;
};

/**
 * What the Downloads page offers for a finished download. A game with an
 * executable is installed whatever else the folder holds, so the lone `.exe`
 * of an unpacked game is never taken for an installer.
 */
export const getCompletedDownloadState = (
  download: Pick<
    Download,
    "downloadPath" | "folderName" | "extractionFailed" | "extracting"
  >,
  game: { executablePath?: string | null } | null | undefined,
  platform: NodeJS.Platform = process.platform
): CompletedDownloadState => {
  if (game?.executablePath) return "play";

  const folder = resolveDownloadFolder(download);

  switch (folder.kind) {
    case "missing":
      return "missing";
    case "archive":
      return "extract";
    case "file":
      return "open-folder";
    case "folder":
      return platform !== "darwin" && findInstaller(folder.folderPath)
        ? "install"
        : "open-folder";
  }
};
