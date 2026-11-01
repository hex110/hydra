import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { isSameTitle, titleSimilarity } from "@shared";
import type {
  LauncherImportCandidate,
  LauncherImportPick,
  LauncherImportResult,
  LauncherInstall,
} from "@types";
import { gamesSublevel } from "@main/level";
import { addGameOutsideLibrary } from "@main/events/library/scan-installed-games";
import { searchCatalogue } from "../library-scan/identify-folders";
import { AchievementWatcherManager } from "../achievements/achievement-watcher-manager";
import { logger } from "../logger";
import { WindowManager } from "../window-manager";
import {
  heroicConfigDirs,
  lutrisDataDirs,
  lutrisRowsToInstalls,
  readHeroicInstalls,
  type LutrisGameRow,
} from "./launcher-import-core";

const execFileAsync = promisify(execFile);
const MIN_CHOICE_SIMILARITY = 0.5;
const LOOKUP_CONCURRENCY = 4;

/**
 * Lutris keeps its library in SQLite. Lutris itself is Python, so wherever it
 * is installed `python3` with its sqlite3 module is too; no SQLite library is
 * bundled for this.
 */
const LUTRIS_QUERY = `
import json, sqlite3, sys
db = sqlite3.connect("file:" + sys.argv[1] + "?mode=ro", uri=True)
db.row_factory = sqlite3.Row
rows = db.execute("select id, name, slug, runner, directory, installed, configpath, playtime, lastplayed from games").fetchall()
print(json.dumps([dict(row) for row in rows]))
`;

const readLutrisRows = async (dbPath: string): Promise<LutrisGameRow[]> => {
  try {
    await fs.promises.access(dbPath);
  } catch {
    return [];
  }
  try {
    const { stdout } = await execFileAsync(
      "python3",
      ["-c", LUTRIS_QUERY, dbPath],
      {
        maxBuffer: 16 * 1024 * 1024,
      }
    );
    return JSON.parse(stdout) as LutrisGameRow[];
  } catch (error) {
    logger.warn("[LauncherImport] Could not read Lutris's library", error);
    return [];
  }
};

export const findLauncherInstalls = async (
  home = os.homedir()
): Promise<LauncherInstall[]> => {
  const installs: LauncherInstall[] = [];
  for (const dir of heroicConfigDirs(home)) {
    installs.push(...(await readHeroicInstalls(dir)));
  }
  for (const dir of lutrisDataDirs(home)) {
    const rows = await readLutrisRows(path.join(dir, "pga.db"));
    installs.push(...(await lutrisRowsToInstalls(rows, dir, home)));
  }
  return installs;
};

const normalize = (value: string) =>
  path.resolve(value).replaceAll("\\", "/").toLowerCase();

const identify = async (
  install: LauncherInstall,
  occupied: string[]
): Promise<LauncherImportCandidate> => {
  const folder = normalize(install.installPath);
  const inLibrary = occupied.some(
    (executable) => executable === folder || executable.startsWith(`${folder}/`)
  );
  if (inLibrary) {
    return {
      install,
      match: null,
      choices: [],
      inLibrary,
      lookupFailed: false,
    };
  }

  const results = await searchCatalogue(install.title);
  if (!results) {
    return { install, match: null, choices: [], inLibrary, lookupFailed: true };
  }
  const exact = results.filter((choice) =>
    isSameTitle(choice.title, install.title)
  );
  const match = exact.length === 1 ? exact[0] : null;
  const choices = match
    ? []
    : results
        .map((choice) => ({
          choice,
          score: titleSimilarity(choice.title, install.title),
        }))
        .filter(({ score }) => score >= MIN_CHOICE_SIMILARITY)
        .sort((a, b) => b.score - a.score)
        .map(({ choice }) => choice);
  return { install, match, choices, inLibrary, lookupFailed: false };
};

/** Every Heroic and Lutris install, with the catalogue game it most likely is. */
export const listLauncherImportCandidates = async (): Promise<
  LauncherImportCandidate[]
> => {
  const installs = await findLauncherInstalls();
  const games = await gamesSublevel.values().all();
  const occupied = games
    .filter((game) => !game.isDeleted && game.executablePath)
    .map((game) => normalize(game.executablePath!));

  const candidates: LauncherImportCandidate[] = [];
  for (let index = 0; index < installs.length; index += LOOKUP_CONCURRENCY) {
    candidates.push(
      ...(await Promise.all(
        installs
          .slice(index, index + LOOKUP_CONCURRENCY)
          .map((install) => identify(install, occupied))
      ))
    );
  }
  return candidates.sort((a, b) =>
    a.install.title.localeCompare(b.install.title)
  );
};

/**
 * Adds the picked installs as games that run from where the other launcher
 * put them, in its Wine prefix (so the saves come along), with its playtime.
 */
export const importLauncherGames = async (
  picks: LauncherImportPick[]
): Promise<LauncherImportResult> => {
  const failed: string[] = [];
  let added = 0;

  await AchievementWatcherManager.runBatch(async () => {
    for (const { objectId, install } of picks) {
      if (!install.executablePath) {
        failed.push(install.title);
        continue;
      }
      const prefix = install.winePrefixPath;
      const prefixExists = prefix
        ? await fs.promises
            .access(prefix)
            .then(() => true)
            .catch(() => false)
        : false;
      const result = await addGameOutsideLibrary(
        objectId,
        install.executablePath,
        {
          winePrefixPath: prefixExists ? prefix : undefined,
          playTimeInMilliseconds: install.playTimeInMinutes * 60_000,
          lastTimePlayed: install.lastPlayedAt
            ? new Date(install.lastPlayedAt)
            : null,
        }
      ).catch((error) => {
        logger.error("[LauncherImport] Could not add a game", {
          objectId,
          error,
        });
        return null;
      });
      if (result) added += 1;
      else failed.push(install.title);
    }
  });

  if (added > 0) WindowManager.sendToAppWindows("on-library-batch-complete");
  logger.info(`[LauncherImport] Added ${added} games, ${failed.length} failed`);
  return { added, failed };
};
