import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

import type { LauncherInstall } from "@types";

/**
 * Reads the games other Linux launchers installed, from their own files.
 * Nothing here writes: Heroic and Lutris keep working as before.
 */

const readJson = async <T>(filePath: string): Promise<T | null> => {
  try {
    return JSON.parse(await fs.promises.readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
};

const exists = async (filePath: string) =>
  fs.promises
    .access(filePath)
    .then(() => true)
    .catch(() => false);

const isWindowsPlatform = (platform: unknown) =>
  typeof platform === "string" && platform.toLowerCase() === "windows";

/** Heroic's config folder: the native package first, then the Flatpak. */
export const heroicConfigDirs = (home: string) => [
  path.join(home, ".config", "heroic"),
  path.join(
    home,
    ".var",
    "app",
    "com.heroicgameslauncher.hgl",
    "config",
    "heroic"
  ),
];

interface HeroicGameConfig {
  winePrefix?: string;
}

const readHeroicPrefix = async (configDir: string, appName: string) => {
  const config = await readJson<Record<string, HeroicGameConfig>>(
    path.join(configDir, "GamesConfig", `${appName}.json`)
  );
  const prefix = config?.[appName]?.winePrefix;
  return typeof prefix === "string" && prefix ? prefix : null;
};

interface HeroicPlaytime {
  totalPlayed?: number;
  lastPlayed?: string;
}

const readHeroicPlaytimes = async (configDir: string) =>
  (await readJson<Record<string, HeroicPlaytime>>(
    path.join(configDir, "store", "timestamp.json")
  )) ?? {};

interface LegendaryInstalled {
  app_name?: string;
  title?: string;
  install_path?: string;
  executable?: string;
  platform?: string;
  is_dlc?: boolean;
}

interface GogInstalled {
  appName?: string;
  install_path?: string;
  platform?: string;
  is_dlc?: boolean;
}

interface GogLibrary {
  games?: { app_name?: string; title?: string }[];
}

interface GogInfo {
  name?: string;
  playTasks?: {
    isPrimary?: boolean;
    type?: string;
    path?: string;
  }[];
}

interface SideloadLibrary {
  games?: {
    app_name?: string;
    title?: string;
    is_installed?: boolean;
    folder_name?: string;
    install?: { executable?: string; platform?: string };
  }[];
}

/** GOG installs name their main executable in `goggame-<id>.info`. */
const readGogExecutable = async (installPath: string, appName: string) => {
  const info = await readJson<GogInfo>(
    path.join(installPath, `goggame-${appName}.info`)
  );
  const task =
    info?.playTasks?.find((item) => item.isPrimary && item.path) ??
    info?.playTasks?.find((item) => item.type === "FileTask" && item.path);
  return {
    title: info?.name ?? null,
    executablePath: task?.path
      ? path.join(installPath, task.path.replaceAll("\\", "/"))
      : null,
  };
};

export const readHeroicInstalls = async (
  configDir: string
): Promise<LauncherInstall[]> => {
  if (!(await exists(configDir))) return [];
  const playtimes = await readHeroicPlaytimes(configDir);
  const installs: LauncherInstall[] = [];

  const withHeroicData = async (
    install: Omit<
      LauncherInstall,
      "winePrefixPath" | "playTimeInMinutes" | "lastPlayedAt"
    >
  ): Promise<LauncherInstall> => {
    const playtime = playtimes[install.appId];
    return {
      ...install,
      winePrefixPath: install.isWindows
        ? await readHeroicPrefix(configDir, install.appId)
        : null,
      playTimeInMinutes:
        typeof playtime?.totalPlayed === "number" ? playtime.totalPlayed : 0,
      lastPlayedAt: playtime?.lastPlayed ?? null,
    };
  };

  const legendary =
    (await readJson<Record<string, LegendaryInstalled>>(
      path.join(configDir, "legendaryConfig", "legendary", "installed.json")
    )) ?? {};
  for (const [appName, game] of Object.entries(legendary)) {
    if (game.is_dlc || !game.install_path || !game.title) continue;
    installs.push(
      await withHeroicData({
        launcher: "heroic",
        store: "epic",
        appId: game.app_name ?? appName,
        title: game.title,
        installPath: game.install_path,
        executablePath: game.executable
          ? path.join(game.install_path, game.executable.replaceAll("\\", "/"))
          : null,
        isWindows: isWindowsPlatform(game.platform),
      })
    );
  }

  const gogInstalled = await readJson<{ installed?: GogInstalled[] }>(
    path.join(configDir, "gog_store", "installed.json")
  );
  const gogLibrary =
    (await readJson<GogLibrary>(
      path.join(configDir, "store_cache", "gog_library.json")
    )) ??
    (await readJson<GogLibrary>(
      path.join(configDir, "gog_store", "library.json")
    ));
  for (const game of gogInstalled?.installed ?? []) {
    if (game.is_dlc || !game.appName || !game.install_path) continue;
    const info = await readGogExecutable(game.install_path, game.appName);
    const title =
      gogLibrary?.games?.find((item) => item.app_name === game.appName)
        ?.title ?? info.title;
    if (!title) continue;
    installs.push(
      await withHeroicData({
        launcher: "heroic",
        store: "gog",
        appId: game.appName,
        title,
        installPath: game.install_path,
        executablePath: info.executablePath,
        isWindows: isWindowsPlatform(game.platform),
      })
    );
  }

  const sideload = await readJson<SideloadLibrary>(
    path.join(configDir, "sideload_apps", "library.json")
  );
  for (const game of sideload?.games ?? []) {
    const executable = game.install?.executable;
    if (!game.app_name || !game.title || !executable) continue;
    if (game.is_installed === false) continue;
    installs.push(
      await withHeroicData({
        launcher: "heroic",
        store: "sideload",
        appId: game.app_name,
        title: game.title,
        installPath: game.folder_name || path.dirname(executable),
        executablePath: executable,
        isWindows: isWindowsPlatform(game.install?.platform),
      })
    );
  }

  return installs;
};

/** Lutris's data folder: the native package first, then the Flatpak. */
export const lutrisDataDirs = (home: string) => [
  path.join(home, ".local", "share", "lutris"),
  path.join(home, ".var", "app", "net.lutris.Lutris", "data", "lutris"),
];

/** A row of Lutris's `games` table in `pga.db`. */
export interface LutrisGameRow {
  id: number;
  name: string;
  slug: string;
  runner: string | null;
  directory: string | null;
  installed: number;
  configpath: string | null;
  playtime: number | null;
  lastplayed: number | null;
}

interface LutrisGameConfig {
  game?: { exe?: string; prefix?: string; working_dir?: string };
}

/** Where Lutris keeps a game's YAML: newer versions in the data folder. */
const lutrisConfigCandidates = (
  dataDir: string,
  home: string,
  configpath: string
) => [
  path.join(dataDir, "games", `${configpath}.yml`),
  path.join(home, ".config", "lutris", "games", `${configpath}.yml`),
  path.join(
    home,
    ".var",
    "app",
    "net.lutris.Lutris",
    "config",
    "lutris",
    "games",
    `${configpath}.yml`
  ),
];

const readLutrisConfig = async (
  dataDir: string,
  home: string,
  configpath: string
): Promise<LutrisGameConfig | null> => {
  for (const candidate of lutrisConfigCandidates(dataDir, home, configpath)) {
    try {
      return parseYaml(
        await fs.promises.readFile(candidate, "utf8")
      ) as LutrisGameConfig;
    } catch {
      // Try the next location.
    }
  }
  return null;
};

/** Runners whose games Hydra can run: Wine for Windows games, native Linux. */
const LUTRIS_RUNNERS = new Set(["wine", "linux"]);

export const lutrisRowsToInstalls = async (
  rows: LutrisGameRow[],
  dataDir: string,
  home: string
): Promise<LauncherInstall[]> => {
  const installs: LauncherInstall[] = [];
  for (const row of rows) {
    if (!row.installed || !row.runner || !LUTRIS_RUNNERS.has(row.runner))
      continue;
    const config = row.configpath
      ? await readLutrisConfig(dataDir, home, row.configpath)
      : null;
    const exe = config?.game?.exe;
    if (!exe) continue;
    const directory = row.directory || config?.game?.working_dir || null;
    const executablePath = path.isAbsolute(exe)
      ? exe
      : directory
        ? path.join(directory, exe)
        : null;
    if (!executablePath) continue;
    installs.push({
      launcher: "lutris",
      store: "lutris",
      appId: row.slug,
      title: row.name,
      installPath: directory ?? path.dirname(executablePath),
      executablePath,
      isWindows: row.runner === "wine",
      winePrefixPath:
        row.runner === "wine" ? (config?.game?.prefix ?? null) : null,
      // Lutris counts hours.
      playTimeInMinutes: Math.round((row.playtime ?? 0) * 60),
      lastPlayedAt: row.lastplayed
        ? new Date(row.lastplayed * 1000).toISOString()
        : null,
    });
  }
  return installs;
};
