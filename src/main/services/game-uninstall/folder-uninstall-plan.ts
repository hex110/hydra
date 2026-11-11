import fs from "node:fs";
import path from "node:path";

import { findGameRootFromExe } from "../../events/helpers/find-game-root.js";

/** Why Hydra won't delete a game's folder on its own. */
export type FolderUninstallError =
  | "no-executable"
  | "not-found"
  | "steam-managed"
  | "protected-folder"
  | "shared-folder"
  | "symlink";

export interface FolderUninstallPlan {
  /** The folder deleted for the game, after climbing out of empty parents. */
  folder: string;
  /** The game's own Wine prefix, when no other game uses it. */
  prefix: string | null;
}

export interface FolderUninstallInput {
  executablePath: string | null;
  /** Library and download folders: kept, and a game root stops below them. */
  libraryRoots: string[];
  steamLibraries: string[];
  /** The resolved prefix of the game, or null off Linux. */
  prefixPath: string | null;
  /** The folder holding Hydra's per-game prefixes. */
  defaultPrefixRoot: string | null;
  /** Executables and prefixes of every other game in the library. */
  otherExecutables: string[];
  otherPrefixes: string[];
  homeDir: string;
}

const MAX_PARENT_LEVELS = 3;

/** Files a file manager or OS leaves behind that don't make a folder shared. */
const IGNORED_ENTRIES = new Set([".ds_store", "desktop.ini", "thumbs.db"]);

/** Folder names people use to hold several games; never climbed into. */
const CONTAINER_NAMES = new Set([
  "games",
  "jeux",
  "juegos",
  "giochi",
  "spiele",
  "jogos",
  "library",
  "libraries",
  "apps",
  "applications",
  "programs",
  "software",
  "installed",
  "drive_c",
  "program files",
  "program files (x86)",
  "programdata",
  "users",
  "windows",
  "steamapps",
  "common",
  "desktop",
  "documents",
  "downloads",
  "pfx",
  "wine-prefixes",
  "prefixes",
]);

const normalize = (value: string) => {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
};

const isSameOrInside = (child: string, parent: string) => {
  const relative = path.relative(normalize(parent), normalize(child));
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
};

const isInside = (child: string, parent: string) =>
  isSameOrInside(child, parent) && normalize(child) !== normalize(parent);

const lstat = (target: string) => {
  try {
    return fs.lstatSync(target);
  } catch {
    return null;
  }
};

/** True when the folder is a mount point or a filesystem root. */
const isMountPoint = (folder: string) => {
  const parent = path.dirname(folder);
  if (parent === folder) return true;
  const own = lstat(folder);
  const above = lstat(parent);
  return !own || !above || own.dev !== above.dev;
};

const holdsOnly = (parent: string, child: string) => {
  try {
    const entries = fs
      .readdirSync(parent)
      .filter((entry) => !IGNORED_ENTRIES.has(entry.toLowerCase()));
    return entries.length === 1 && entries[0] === path.basename(child);
  } catch {
    return false;
  }
};

const looksLikePrefix = (folder: string) =>
  fs.existsSync(path.join(folder, "pfx")) ||
  fs.existsSync(path.join(folder, "drive_c"));

/**
 * A folder that must survive an uninstall: the filesystem or home folder (or
 * anything holding them), a library, download or Steam library folder, the
 * prefix root, and anything named like a folder that holds many games.
 */
const isProtected = (folder: string, input: FolderUninstallInput) => {
  if (isSameOrInside(input.homeDir, folder)) return true;
  if (CONTAINER_NAMES.has(path.basename(folder).toLowerCase())) return true;
  const roots = [
    ...input.libraryRoots,
    ...input.steamLibraries,
    ...(input.defaultPrefixRoot ? [input.defaultPrefixRoot] : []),
  ];
  return roots.some((root) => isSameOrInside(root, folder));
};

/** The game folder as it sits in a library folder, or found from the exe. */
const findGameFolder = async (
  executablePath: string,
  libraryRoots: string[]
) => {
  for (const root of libraryRoots) {
    if (!isInside(executablePath, root)) continue;
    const [first, ...rest] = path
      .relative(path.resolve(root), executablePath)
      .split(path.sep);
    if (rest.length > 0) return path.join(path.resolve(root), first);
  }
  return findGameRootFromExe(executablePath);
};

const sharesFolder = (folder: string, input: FolderUninstallInput) =>
  input.otherExecutables.some((other) => isSameOrInside(other, folder)) ||
  input.otherPrefixes.some((other) => isSameOrInside(other, folder)) ||
  input.libraryRoots.some((root) => isSameOrInside(root, folder));

/**
 * Works out what uninstalling a game Hydra didn't download deletes: the
 * game's folder, any parents that hold nothing but it, and its own prefix.
 */
export const planFolderUninstall = async (
  input: FolderUninstallInput
): Promise<
  | { ok: true; plan: FolderUninstallPlan }
  | { ok: false; error: FolderUninstallError }
> => {
  if (!input.executablePath) return { ok: false, error: "no-executable" };
  const executablePath = path.resolve(input.executablePath);

  if (
    input.steamLibraries.some((library) =>
      isInside(executablePath, path.join(library, "steamapps"))
    )
  ) {
    return { ok: false, error: "steam-managed" };
  }

  const found = await findGameFolder(executablePath, input.libraryRoots);
  if (!found || !fs.existsSync(found)) return { ok: false, error: "not-found" };

  let folder = path.resolve(found);
  const stat = lstat(folder);
  if (!stat?.isDirectory()) return { ok: false, error: "symlink" };
  if (isProtected(folder, input) || isMountPoint(folder)) {
    return { ok: false, error: "protected-folder" };
  }
  if (sharesFolder(folder, input)) return { ok: false, error: "shared-folder" };

  for (let level = 0; level < MAX_PARENT_LEVELS; level++) {
    const parent = path.dirname(folder);
    if (
      parent === folder ||
      isProtected(parent, input) ||
      isMountPoint(parent) ||
      lstat(parent)?.isSymbolicLink() ||
      !holdsOnly(parent, folder)
    ) {
      break;
    }
    folder = parent;
  }

  const prefix = input.prefixPath ? path.resolve(input.prefixPath) : null;
  const ownPrefix =
    prefix &&
    lstat(prefix)?.isDirectory() &&
    looksLikePrefix(prefix) &&
    !isSameOrInside(input.homeDir, prefix) &&
    !(
      input.defaultPrefixRoot && isSameOrInside(input.defaultPrefixRoot, prefix)
    ) &&
    !input.otherPrefixes.some(
      (other) => isSameOrInside(other, prefix) || isSameOrInside(prefix, other)
    ) &&
    !input.otherExecutables.some((other) => isSameOrInside(other, prefix)) &&
    !input.libraryRoots.some((root) => isSameOrInside(root, prefix))
      ? prefix
      : null;

  return { ok: true, plan: { folder, prefix: ownPrefix } };
};
