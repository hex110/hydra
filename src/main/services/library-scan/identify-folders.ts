import fs from "node:fs";
import path from "node:path";
import { cleanReleaseName, isSameTitle, titleSimilarity } from "@shared";
import { isRedistributableDirectory } from "@main/helpers/game-executable-ranking";
import {
  guessGameExecutable,
  type ExecutableFileCandidate,
} from "@main/helpers/guess-game-executable";
import { GameExecutables } from "@main/services/game-executables";
import { HydraApi } from "@main/services/hydra-api";
import { logger } from "@main/services/logger";
import { findGameExecutableInFolder } from "@main/helpers/find-game-executable";

const MAX_DEPTH = 5;
const MAX_ENTRIES_PER_FOLDER = 4000;
const SUGGESTION_LIMIT = 6;
const MIN_CHOICE_SIMILARITY = 0.5;
const LOOKUP_CONCURRENCY = 4;

export interface FolderChoice {
  objectId: string;
  title: string;
  iconUrl: string | null;
}

export interface IdentifiedFolder {
  folderPath: string;
  executablePath: string;
  /** Set when exactly one catalogue game matches the folder name. */
  match: FolderChoice | null;
  /** Plausible games for the user to pick from when there is no match. */
  choices: FolderChoice[];
}

interface CatalogueSuggestion {
  title: string;
  objectId: string;
  shop: string;
  iconUrl: string | null;
}

const normalize = (value: string) =>
  path.resolve(value).replaceAll("\\", "/").toLowerCase();

const isInside = (child: string, parent: string) =>
  child === parent || child.startsWith(`${parent}/`);

const listExecutables = async (
  folderPath: string,
  isCancelled: () => boolean
): Promise<ExecutableFileCandidate[]> => {
  const executables: ExecutableFileCandidate[] = [];
  let visited = 0;

  const walk = async (current: string, depth: number) => {
    if (depth > MAX_DEPTH || visited > MAX_ENTRIES_PER_FOLDER) return;
    if (isCancelled()) return;

    const entries = await fs.promises
      .readdir(current, { withFileTypes: true })
      .catch(() => []);

    for (const entry of entries) {
      visited += 1;
      if (visited > MAX_ENTRIES_PER_FOLDER) return;

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

const searchCatalogue = async (
  query: string
): Promise<FolderChoice[] | null> => {
  try {
    const suggestions = await HydraApi.get<CatalogueSuggestion[]>(
      "/catalogue/search/suggestions",
      { query, limit: SUGGESTION_LIMIT, shop: "steam" },
      { needsAuth: false }
    );

    return (Array.isArray(suggestions) ? suggestions : [])
      .filter((suggestion) => suggestion.shop === "steam")
      .map(({ objectId, title, iconUrl }) => ({
        objectId,
        title,
        iconUrl: iconUrl ?? null,
      }));
  } catch (error) {
    logger.warn("[IdentifyFolders] Catalogue search failed", { query, error });
    return null;
  }
};

/** Prefer the catalogue's known executable for a game, then fall back to a guess. */
const pickExecutable = async (
  folderPath: string,
  objectId: string | null,
  title: string,
  candidates: ExecutableFileCandidate[]
) => {
  if (objectId) {
    const known = GameExecutables.getExecutablesForGame(objectId);
    if (known?.length) {
      const found = await findGameExecutableInFolder(folderPath, known);
      if (found) return found;
    }
  }

  const guessed = guessGameExecutable(candidates, title);
  return guessed ? path.join(folderPath, guessed) : null;
};

const identifyFolder = async (
  folderPath: string,
  libraryObjectIds: Set<string>,
  isCancelled: () => boolean
): Promise<IdentifiedFolder | null> => {
  const candidates = await listExecutables(folderPath, isCancelled);
  if (candidates.length === 0) return null;

  const folderTitle = cleanReleaseName(path.basename(folderPath));
  if (!folderTitle) return null;

  const results = await searchCatalogue(folderTitle);
  if (!results) return null;

  const available = results.filter(
    (choice) => !libraryObjectIds.has(choice.objectId)
  );
  const exactMatches = available.filter((choice) =>
    isSameTitle(choice.title, folderTitle)
  );
  const match = exactMatches.length === 1 ? exactMatches[0] : null;

  const choices = match
    ? []
    : available
        .map((choice) => ({
          choice,
          score: titleSimilarity(choice.title, folderTitle),
        }))
        .filter(({ score }) => score >= MIN_CHOICE_SIMILARITY)
        .sort((a, b) => b.score - a.score)
        .map(({ choice }) => choice);

  if (!match && choices.length === 0) {
    logger.info("[IdentifyFolders] No catalogue match for folder", {
      folderPath,
      folderTitle,
    });
    return null;
  }

  const executablePath = await pickExecutable(
    folderPath,
    match?.objectId ?? null,
    match?.title ?? folderTitle,
    candidates
  );
  if (!executablePath) return null;

  return { folderPath, executablePath, match, choices };
};

/**
 * Identifies game folders directly inside the given roots that no library
 * game or earlier scan result occupies, by searching the catalogue for the
 * cleaned-up folder name.
 */
export const identifyUnclaimedFolders = async (options: {
  roots: string[];
  occupiedPaths: string[];
  libraryObjectIds: Set<string>;
  isCancelled: () => boolean;
}): Promise<IdentifiedFolder[]> => {
  const occupied = options.occupiedPaths.map(normalize);
  const folders: string[] = [];

  for (const root of new Set(options.roots.map((r) => path.resolve(r)))) {
    const entries = await fs.promises
      .readdir(root, { withFileTypes: true })
      .catch(() => []);

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;

      const folderPath = path.join(root, entry.name);
      const normalizedFolder = normalize(folderPath);

      if (occupied.some((p) => isInside(p, normalizedFolder))) continue;
      folders.push(folderPath);
    }
  }

  const identified: IdentifiedFolder[] = [];
  let next = 0;

  const worker = async () => {
    while (next < folders.length && !options.isCancelled()) {
      const folderPath = folders[next++];
      const result = await identifyFolder(
        folderPath,
        options.libraryObjectIds,
        options.isCancelled
      ).catch((error) => {
        logger.error("[IdentifyFolders] Failed to identify folder", {
          folderPath,
          error,
        });
        return null;
      });
      if (result) identified.push(result);
    }
  };

  await Promise.all(Array.from({ length: LOOKUP_CONCURRENCY }, worker));

  // Two folders can resolve to the same game; only the first one is added.
  const seen = new Set<string>();
  return identified.filter((folder) => {
    if (!folder.match) return true;
    if (seen.has(folder.match.objectId)) return false;
    seen.add(folder.match.objectId);
    return true;
  });
};
