import fs from "node:fs";
import path from "node:path";

const MAX_ROOT_DEPTH = 3;

const readDirectory = (directory: string) =>
  fs.promises
    .readdir(directory, { withFileTypes: true })
    .catch(() => [] as fs.Dirent[]);

/** Resolves `segments` under `base`, ignoring case. */
const resolveIgnoringCase = async (
  base: string,
  segments: string[]
): Promise<string | null> => {
  let current = base;
  for (const segment of segments) {
    const entries = await readDirectory(current);
    const match =
      entries.find((entry) => entry.name === segment) ??
      entries.find(
        (entry) => entry.name.toLowerCase() === segment.toLowerCase()
      );
    if (!match) return null;
    current = path.join(current, match.name);
  }
  return current;
};

/**
 * Finds the folder inside a downloaded update that corresponds to the
 * installed game's folder: the one holding the game's executable at the same
 * relative path. Releases often wrap the game in an extra folder, so a few
 * levels are searched. Falls back to the first folder whose top-level entries
 * mostly match the installed game's.
 */
export const locateUpdateRoot = async (
  extractedDirectory: string,
  installDirectory: string,
  executablePath: string
): Promise<string | null> => {
  const relativeExecutable = path
    .relative(installDirectory, executablePath)
    .split(path.sep)
    .filter(Boolean);

  let level = [extractedDirectory];
  for (let depth = 0; depth <= MAX_ROOT_DEPTH && level.length > 0; depth++) {
    const next: string[] = [];
    for (const directory of level) {
      if (await resolveIgnoringCase(directory, relativeExecutable)) {
        return directory;
      }
      for (const entry of await readDirectory(directory)) {
        if (entry.isDirectory()) next.push(path.join(directory, entry.name));
      }
    }
    level = next;
  }

  const installed = new Set(
    (await readDirectory(installDirectory)).map((entry) =>
      entry.name.toLowerCase()
    )
  );

  let candidate = extractedDirectory;
  for (let depth = 0; depth <= MAX_ROOT_DEPTH; depth++) {
    const entries = await readDirectory(candidate);
    const shared = entries.filter((entry) =>
      installed.has(entry.name.toLowerCase())
    ).length;
    if (entries.length > 0 && shared * 2 >= entries.length) return candidate;
    if (entries.length !== 1 || !entries[0].isDirectory()) return null;
    candidate = path.join(candidate, entries[0].name);
  }

  return null;
};

const moveFile = async (source: string, target: string) => {
  try {
    await fs.promises.rename(source, target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
    await fs.promises.copyFile(source, target);
    await fs.promises.unlink(source);
  }
};

/**
 * Moves every file under `source` into `target`, replacing files with the
 * same path and keeping the rest of `target` (saves, configs, mods).
 * Returns the number of files moved.
 */
export const mergeDirectoryInto = async (
  source: string,
  target: string
): Promise<number> => {
  await fs.promises.mkdir(target, { recursive: true });
  let moved = 0;

  for (const entry of await readDirectory(source)) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    const existing = await fs.promises.lstat(to).catch(() => null);

    if (entry.isDirectory()) {
      if (existing && !existing.isDirectory()) await fs.promises.rm(to);
      moved += await mergeDirectoryInto(from, to);
    } else {
      if (existing?.isDirectory()) {
        await fs.promises.rm(to, { recursive: true, force: true });
      }
      await moveFile(from, to);
      moved += 1;
    }
  }

  return moved;
};

/** True when a download holds an installer to run rather than game files. */
export const looksLikeInstaller = async (directory: string) => {
  const entries = await readDirectory(directory);
  return entries.some((entry) => /^setup.*\.exe$/i.test(entry.name));
};
