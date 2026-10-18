import fs from "node:fs";
import path from "node:path";

import { logger } from "@main/services/logger";
import {
  isRedistributableDirectory,
  rankExecutableCandidates,
  type ExecutableSearchScope,
  type KnownGameExecutable,
} from "./game-executable-ranking";
import {
  guessGameExecutable,
  type ExecutableFileCandidate,
} from "./guess-game-executable";

const MAX_CANDIDATE_DEPTH = 5;
const MAX_CANDIDATE_ENTRIES = 4000;

export const findGameExecutableInFolder = async (
  folderPath: string,
  executables: KnownGameExecutable[],
  scope: ExecutableSearchScope = "installation"
): Promise<string | null> => {
  if (executables.length === 0) return null;

  let entries: fs.Dirent[];

  try {
    entries = await fs.promises.readdir(folderPath, {
      withFileTypes: true,
      recursive: true,
    });
  } catch (err) {
    logger.error(
      `[findGameExecutableInFolder] Error reading folder ${folderPath}:`,
      err
    );
    return null;
  }

  const relativeFilePaths: string[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    const parentPath =
      "parentPath" in entry
        ? entry.parentPath
        : ((entry as unknown as { path?: string }).path ?? folderPath);

    relativeFilePaths.push(
      path.relative(folderPath, path.join(parentPath, entry.name))
    );
  }

  const match = rankExecutableCandidates(relativeFilePaths, executables, scope);

  return match ? path.join(folderPath, match) : null;
};

/** Lists the `.exe` files in a game folder, skipping redistributable folders. */
export const listExecutableCandidates = async (
  folderPath: string,
  isCancelled: () => boolean = () => false
): Promise<ExecutableFileCandidate[]> => {
  const executables: ExecutableFileCandidate[] = [];
  let visited = 0;

  const walk = async (current: string, depth: number) => {
    if (depth > MAX_CANDIDATE_DEPTH || visited > MAX_CANDIDATE_ENTRIES) return;
    if (isCancelled()) return;

    const entries = await fs.promises
      .readdir(current, { withFileTypes: true })
      .catch(() => []);

    for (const entry of entries) {
      visited += 1;
      if (visited > MAX_CANDIDATE_ENTRIES) return;

      const entryPath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        if (entry.name.startsWith(".")) continue;
        if (isRedistributableDirectory(entry.name)) continue;
        await walk(entryPath, depth + 1);
        continue;
      }

      if (!entry.isFile() || !/\.exe$/i.test(entry.name)) continue;

      const stats = await fs.promises.stat(entryPath).catch(() => null);
      executables.push({
        relativePath: path.relative(folderPath, entryPath),
        sizeInBytes: stats?.size ?? 0,
      });
    }
  };

  await walk(folderPath, 0);
  return executables;
};

/**
 * The catalogue's known executable when the folder contains it, otherwise a
 * guess, for games the catalogue knows nothing about.
 */
export const findOrGuessGameExecutable = async (
  folderPath: string,
  knownExecutables: KnownGameExecutable[] | null,
  title: string
): Promise<string | null> => {
  if (knownExecutables?.length) {
    const found = await findGameExecutableInFolder(
      folderPath,
      knownExecutables
    );
    if (found) return found;
  }

  const guessed = guessGameExecutable(
    await listExecutableCandidates(folderPath),
    title
  );
  return guessed ? path.join(folderPath, guessed) : null;
};
