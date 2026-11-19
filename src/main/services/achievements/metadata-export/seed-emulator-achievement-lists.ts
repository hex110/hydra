import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";

import type { Game } from "@types";

import { achievementsLogger } from "../../logger";
import { Wine } from "../../wine";
import { getPublicDocumentsPath } from "../find-achievement-files";
import { getGameAchievementData } from "../get-game-achievement-data";
import {
  collectEmulatorDirectories,
  findEntriesBreadthFirst,
  readDirectorySafe,
  resolveContainmentRoot,
} from "../game-directory.js";
import { resolveGameExecutablePath } from "../resolve-game-executable-path";
import {
  mergeEmulatorAchievementList,
  parseSteamEmuIni,
  type SteamEmuKind,
} from "./emulator-achievement-list";

const STEAM_EMU_INI_NAME = "steam_emu.ini";
const ACHIEVEMENTS_FILE_NAME = "achievements.ini";
const ACHIEVEMENT_FETCH_TIMEOUT_IN_MS = 4_000;

interface EmulatorTarget {
  kind: SteamEmuKind;
  appId: string;
}

const isSteamEmuIni = (entry: fs.Dirent) =>
  entry.isFile() && entry.name.toLowerCase() === STEAM_EMU_INI_NAME;

const findSteamEmuIniFiles = async (executablePath: string) => {
  const found = new Set<string>();

  for (const directory of await collectEmulatorDirectories(executablePath)) {
    const entries = await readDirectorySafe(directory);

    for (const entry of entries ?? []) {
      if (isSteamEmuIni(entry)) found.add(path.join(directory, entry.name));
    }
  }

  if (found.size) return [...found];

  const containmentRoot = await resolveContainmentRoot(executablePath);

  if (!containmentRoot) return [];

  return findEntriesBreadthFirst(containmentRoot, isSteamEmuIni);
};

const readEmulatorTarget = async (
  iniPath: string,
  fallbackAppId: string
): Promise<EmulatorTarget | null> => {
  try {
    const directory = path.dirname(iniPath);
    const contents = await fs.promises.readFile(iniPath, "utf-8");
    const siblings = await fs.promises.readdir(directory);
    const parsed = parseSteamEmuIni(contents, siblings);

    if (!parsed) return null;

    return { kind: parsed.kind, appId: parsed.appId ?? fallbackAppId };
  } catch {
    return null;
  }
};

const findEmulatorTargets = async (executablePath: string, game: Game) => {
  const targets = new Map<string, EmulatorTarget>();

  for (const iniPath of await findSteamEmuIniFiles(executablePath)) {
    const target = await readEmulatorTarget(iniPath, game.objectId);

    if (target) targets.set(`${target.kind}/${target.appId}`, target);
  }

  return [...targets.values()];
};

const resolvePrefixRoot = (game: Game) => {
  if (process.platform === "win32") return "";

  const prefixPath = Wine.getEffectivePrefixPath(
    game.winePrefixPath,
    game.objectId
  );

  if (!prefixPath) return null;
  if (!fs.existsSync(path.join(prefixPath, "drive_c", "users"))) return null;

  return prefixPath;
};

const readFileOrNull = async (filePath: string) => {
  try {
    return await fs.promises.readFile(filePath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;

    throw error;
  }
};

const writeFileAtomically = async (filePath: string, contents: string) => {
  const temporaryFilePath = `${filePath}.${randomUUID()}.tmp`;

  try {
    await fs.promises.writeFile(temporaryFilePath, contents, {
      encoding: "utf-8",
      flag: "wx",
    });

    await fs.promises.rename(temporaryFilePath, filePath);
  } catch (error) {
    await fs.promises.rm(temporaryFilePath, { force: true }).catch(() => {});

    throw error;
  }
};

interface SeedTargetOptions {
  game: Game;
  target: EmulatorTarget;
  directory: string;
  names: string[];
  signal?: AbortSignal;
}

const seedTarget = async ({
  game,
  target,
  directory,
  names,
  signal,
}: SeedTargetOptions) => {
  const filePath = path.join(directory, ACHIEVEMENTS_FILE_NAME);

  const existing = await readFileOrNull(filePath);
  let merged = mergeEmulatorAchievementList(existing, names);

  if (merged === null) {
    achievementsLogger.log(
      `${filePath} already lists every achievement of ${game.objectId} (${target.kind})`
    );
    return;
  }

  if (signal?.aborted) return;

  const current = await readFileOrNull(filePath);

  if (current !== existing) {
    merged = mergeEmulatorAchievementList(current, names);

    if (merged === null) return;
  }

  await fs.promises.mkdir(directory, { recursive: true });
  await writeFileAtomically(filePath, merged);

  achievementsLogger.log(
    `Listed all ${names.length} achievements of ${game.objectId} in ${filePath} (${target.kind})`
  );
};

/**
 * RUNE and CODEX only know the achievements listed in their achievements.ini,
 * and Unreal games skip the ones the emulator cannot read, so the file is
 * seeded with every achievement as locked before the game starts.
 */
export const seedEmulatorAchievementLists = async (
  game: Game,
  signal?: AbortSignal
): Promise<void> => {
  try {
    if (game.shop !== "steam") return;

    const executablePath = resolveGameExecutablePath(game);

    if (!executablePath) return;

    const targets = await findEmulatorTargets(executablePath, game);

    if (!targets.length) return;

    const prefixRoot = resolvePrefixRoot(game);

    if (prefixRoot === null) {
      achievementsLogger.log(
        `The Wine prefix of ${game.objectId} is not set up yet, not seeding emulator achievements`
      );
      return;
    }

    const achievements = await getGameAchievementData(
      game.objectId,
      "steam",
      true,
      () => true,
      { signal, timeout: ACHIEVEMENT_FETCH_TIMEOUT_IN_MS }
    );

    const names = achievements.map(({ name }) => name);

    if (!names.length) {
      achievementsLogger.log(
        `No achievements known for ${game.objectId}, not seeding emulator achievements`
      );
      return;
    }

    for (const target of targets) {
      if (signal?.aborted) return;

      try {
        await seedTarget({
          game,
          target,
          directory: path.join(
            prefixRoot,
            getPublicDocumentsPath(),
            "Steam",
            target.kind,
            target.appId
          ),
          names,
          signal,
        });
      } catch (error) {
        achievementsLogger.error(
          `Failed to seed ${target.kind} achievements for ${game.objectId}`,
          error
        );
      }
    }
  } catch (error) {
    achievementsLogger.error(
      `Failed to seed emulator achievements for ${game.objectId}`,
      error
    );
  }
};
