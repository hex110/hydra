import fs from "node:fs";
import path from "node:path";

import { gamesSublevel, levelKeys } from "@main/level";
import { applyFirstRunChecks } from "@main/services/capabilities/capability-checks";
import { setGameLaunching } from "@main/services/game-running-state";
import { logger } from "@main/services/logger";
import { SystemPath } from "@main/services/system-path";
import { WindowManager } from "@main/services/window-manager";
import type {
  Game,
  GameRun,
  GameRunLauncher,
  GameRunLogFile,
  GameRunTool,
  GameShop,
} from "@types";

import { ModActivity } from "@main/services/mods/activity";
import { ModStore } from "@main/services/mods/mod-store";
import { buildRunMods } from "@shared";

import { evaluateRunChecks } from "./run-checks-core";
import {
  LATEST_LINK,
  MAX_LOG_BYTES,
  RUN_FILE,
  RUNS_KEPT_PER_GAME,
  SUMMARY_FILE,
  classifyRunOutcome,
  closeLeftoverRun,
  formatRunSummary,
  gameFolderName,
  gameFolderSuffix,
  runIdFromDate,
  selectRunsToPrune,
} from "./game-runs-core";

/** Logs tools write next to the game, collected when they changed during the run. */
const GAME_FOLDER_LOGS = ["ReShade.log", "OptiScaler.log"];
/** Time for umu and Proton to finish writing after the game is gone. */
const LOG_SETTLE_MS = 3_000;
/** How long to wait for the launcher's exit code after the game closed. */
const EXIT_WAIT_MS = 30_000;
/**
 * How long to wait for the game to show up after the launcher exited, for
 * launchers that start the game and quit.
 */
const DETECTION_GRACE_MS = 15_000;

interface LogSource {
  name: string;
  path: string;
  /** Copy from this byte offset; for files shared by every run. */
  startOffset?: number;
}

interface ActiveRun {
  run: GameRun;
  startedAtMs: number;
  logSources: LogSource[];
  /** The launcher's process reports the exit code. */
  awaitsExit: boolean;
  exitedAtMs: number | null;
  closed: boolean;
  finishTimer: NodeJS.Timeout | null;
  /** The game's own stdout and stderr, when Hydra could capture them. */
  outputLogPath: string | null;
}

export const getRunsPath = () =>
  path.join(SystemPath.getPath("userData"), "runs");

const activeRuns = new Map<string, ActiveRun>();

const findGameFolder = (shop: GameShop, objectId: string) => {
  const suffix = gameFolderSuffix(shop, objectId);
  try {
    const existing = fs
      .readdirSync(getRunsPath())
      .find((entry) => entry.endsWith(suffix));
    return existing ? path.join(getRunsPath(), existing) : null;
  } catch {
    return null;
  }
};

const toolsFromGame = (game: Game): GameRunTool[] => {
  const tools: GameRunTool[] = [];
  if (game.optiScaler)
    tools.push({
      name: "OptiScaler",
      version: game.optiScaler.version,
      detail: `as ${game.optiScaler.proxyDll}`,
    });
  if (game.renoDx) {
    tools.push({
      name: "ReShade",
      version: game.renoDx.reShadeVersion,
      detail: game.renoDx.proxyDll
        ? `as ${game.renoDx.proxyDll}`
        : "loaded by OptiScaler",
    });
    tools.push({
      name: "RenoDX",
      version: game.renoDx.addonVersion,
      detail: game.renoDx.modTitle,
    });
  }
  if (game.onlineFix && !game.onlineFixDisabled)
    tools.push({ name: "OnlineFix", version: "detected" });
  return tools;
};

const gameFolderLogSources = (game: Game, executablePath: string) => {
  const directories = new Set(
    [
      path.dirname(executablePath),
      game.optiScaler?.directory,
      game.renoDx?.directory,
    ].filter((directory): directory is string => Boolean(directory))
  );
  return [...directories].flatMap((directory) =>
    GAME_FOLDER_LOGS.map((name) => ({ name, path: path.join(directory, name) }))
  );
};

const announceChange = (run: GameRun) =>
  WindowManager.sendToAppWindows(
    "on-game-runs-changed",
    run.shop,
    run.objectId
  );

const writeRun = (run: GameRun) => {
  fs.writeFileSync(
    path.join(run.directory, RUN_FILE),
    JSON.stringify(run, null, 2)
  );
  fs.writeFileSync(
    path.join(run.directory, SUMMARY_FILE),
    formatRunSummary(run)
  );
};

const copyLog = (
  source: LogSource,
  runDirectory: string,
  sinceMs: number,
  usedNames: Set<string>
): GameRunLogFile | null => {
  let stats: fs.Stats;
  try {
    stats = fs.statSync(source.path);
  } catch {
    return null;
  }
  // A log left over from an earlier run says nothing about this one.
  if (stats.mtimeMs < sinceMs) return null;

  const start = Math.max(
    source.startOffset ?? 0,
    stats.size - MAX_LOG_BYTES,
    0
  );
  const length = stats.size - start;
  if (length <= 0) return null;

  let name = source.name;
  for (let index = 2; usedNames.has(name); index += 1)
    name = `${path.parse(source.name).name}-${index}${path.extname(source.name)}`;
  usedNames.add(name);

  const buffer = Buffer.alloc(length);
  const descriptor = fs.openSync(source.path, "r");
  try {
    fs.readSync(descriptor, buffer, 0, length, start);
  } finally {
    fs.closeSync(descriptor);
  }
  fs.writeFileSync(path.join(runDirectory, name), buffer);

  return {
    name,
    source: source.path,
    sizeInBytes: length,
    truncated: start > (source.startOffset ?? 0),
  };
};

const OUTPUT_LOG = "game-output.log";

const outputLogEntry = (outputLogPath: string): GameRunLogFile | null => {
  const size = fs.statSync(outputLogPath, { throwIfNoEntry: false })?.size;
  if (!size) {
    fs.rmSync(outputLogPath, { force: true });
    return null;
  }
  return {
    name: OUTPUT_LOG,
    source: "the game's output",
    sizeInBytes: size,
    truncated: false,
  };
};

/** The copied logs' text, by file name, for the checks. */
const readLogTexts = (run: GameRun) => {
  const texts: Record<string, string> = {};
  for (const log of run.logs) {
    try {
      texts[log.name] = fs.readFileSync(
        path.join(run.directory, log.name),
        "utf8"
      );
    } catch {
      // A log that cannot be read is treated as missing.
    }
  }
  return texts;
};

const pointLatestAt = (gameFolder: string, runId: string) => {
  const link = path.join(gameFolder, LATEST_LINK);
  try {
    fs.rmSync(link, { force: true });
    fs.symlinkSync(runId, link);
  } catch (error) {
    logger.warn("Could not update the latest run link", { link, error });
  }
};

const pruneRuns = (gameFolder: string) => {
  const runIds = fs
    .readdirSync(gameFolder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  for (const runId of selectRunsToPrune(runIds, RUNS_KEPT_PER_GAME))
    fs.rmSync(path.join(gameFolder, runId), { recursive: true, force: true });
};

const finishRun = (gameKey: string) => {
  const active = activeRuns.get(gameKey);
  if (!active) return;
  activeRuns.delete(gameKey);
  setGameLaunching(gameKey, false);
  if (active.finishTimer) clearTimeout(active.finishTimer);

  const { run } = active;
  const endedAtMs = active.exitedAtMs ?? Date.now();
  run.endedAt ??= new Date(endedAtMs).toISOString();
  run.durationInMilliseconds ??= endedAtMs - active.startedAtMs;
  if (run.outcome === "running")
    run.outcome = classifyRunOutcome({
      exitCode: run.exitCode,
      signal: run.signal,
      gameDetected: run.gameDetected,
      durationInMilliseconds: run.durationInMilliseconds,
    });

  // Save the ending now: Hydra may be gone before the logs settle (a reboot
  // right after the game closes).
  try {
    writeRun(run);
  } catch (error) {
    logger.warn("Could not write the game run record", {
      directory: run.directory,
      error,
    });
  }

  // Wait for the launcher and Proton to flush before copying their logs.
  setTimeout(() => {
    try {
      const usedNames = new Set(run.logs.map((log) => log.name));
      for (const source of active.logSources) {
        const log = copyLog(
          source,
          run.directory,
          active.startedAtMs,
          usedNames
        );
        if (log) run.logs.push(log);
      }
      const output =
        active.outputLogPath && outputLogEntry(active.outputLogPath);
      if (output) run.logs.push(output);
      run.checks = evaluateRunChecks(run, readLogTexts(run));
      writeRun(run);
      announceChange(run);
      void applyFirstRunChecks(run);
    } catch (error) {
      logger.error("Could not finish the game run record", {
        directory: run.directory,
        error,
      });
    }
  }, LOG_SETTLE_MS);
};

const update = (gameKey: string, apply: (active: ActiveRun) => void) => {
  const active = activeRuns.get(gameKey);
  if (!active) return;
  apply(active);
  try {
    writeRun(active.run);
  } catch (error) {
    logger.warn("Could not write the game run record", { gameKey, error });
  }
};

const readRun = (directory: string): GameRun | null => {
  try {
    const run = JSON.parse(
      fs.readFileSync(path.join(directory, RUN_FILE), "utf8")
    ) as GameRun;
    run.directory = directory;
    return run;
  } catch {
    return null;
  }
};

const nowIso = () => new Date().toISOString();

/**
 * One folder per launch under `<userData>/runs/<game>/<run id>/`, with
 * `run.json`, a readable `summary.md` and copies of the logs.
 */
export const GameRuns = {
  async start(options: {
    shop: GameShop;
    objectId: string;
    executablePath: string;
  }) {
    const gameKey = levelKeys.game(options.shop, options.objectId);
    const existing = activeRuns.get(gameKey);
    if (existing) {
      existing.run.outcome = "unknown";
      existing.run.events.push({
        at: nowIso(),
        message: "The game was launched again before this run ended.",
      });
      finishRun(gameKey);
    }

    try {
      const game = await gamesSublevel.get(gameKey);
      const title = game?.title ?? options.objectId;
      const gameFolder =
        findGameFolder(options.shop, options.objectId) ??
        path.join(
          getRunsPath(),
          gameFolderName(title, options.shop, options.objectId)
        );
      const modState = await ModStore.readState(
        options.shop,
        options.objectId
      ).catch(() => null);
      const mods = modState
        ? buildRunMods(
            modState.mods,
            modState.playMode,
            modState.loader
              ? { name: modState.loader.name, version: modState.loader.version }
              : null
          )
        : null;
      const startedAt = new Date();
      const id = runIdFromDate(startedAt);
      const directory = path.join(gameFolder, id);
      fs.mkdirSync(directory, { recursive: true });

      const run: GameRun = {
        id,
        shop: options.shop,
        objectId: options.objectId,
        title,
        startedAt: startedAt.toISOString(),
        endedAt: null,
        durationInMilliseconds: null,
        outcome: "running",
        exitCode: null,
        signal: null,
        gameDetected: false,
        launcher: null,
        executablePath: options.executablePath,
        commandLine: null,
        environment: {},
        protonPath: game?.protonPath ?? null,
        winePrefixPath: game?.winePrefixPath ?? null,
        tools: game ? toolsFromGame(game) : [],
        mods,
        events: [],
        logs: [],
        directory,
      };

      setGameLaunching(gameKey, true);
      activeRuns.set(gameKey, {
        run,
        startedAtMs: startedAt.getTime(),
        logSources: game
          ? gameFolderLogSources(game, options.executablePath)
          : [],
        awaitsExit: false,
        exitedAtMs: null,
        closed: false,
        finishTimer: null,
        outputLogPath: null,
      });
      writeRun(run);
      if (mods)
        void ModActivity.append(options.shop, options.objectId, {
          kind: "launch",
          message: `Started the game ${mods.modded ? "modded" : "without the loader"} with ${mods.mods.length} mods on (run ${id}).`,
          details: { runId: id, mods: mods.mods.map((mod) => mod.name) },
        });
      pointLatestAt(gameFolder, id);
      pruneRuns(gameFolder);
      announceChange(run);
    } catch (error) {
      logger.error("Could not start a game run record", { gameKey, error });
    }
  },

  /** What was actually started; called once the launcher has the command. */
  recordLaunch(
    gameKey: string,
    launch: {
      launcher: GameRunLauncher;
      commandLine: string;
      environment?: Record<string, string>;
      protonPath?: string | null;
      winePrefixPath?: string | null;
      logs?: LogSource[];
      awaitsExit?: boolean;
    }
  ) {
    update(gameKey, (active) => {
      active.run.launcher = launch.launcher;
      active.run.commandLine = launch.commandLine;
      active.run.environment = launch.environment ?? {};
      if (launch.protonPath !== undefined)
        active.run.protonPath = launch.protonPath;
      if (launch.winePrefixPath !== undefined)
        active.run.winePrefixPath = launch.winePrefixPath;
      active.logSources.push(...(launch.logs ?? []));
      active.awaitsExit = launch.awaitsExit ?? false;
    });
  },

  /**
   * A file descriptor for the game's stdout and stderr, inside the run folder.
   * The caller closes it once the game is spawned.
   */
  openOutputLog(gameKey: string): number | null {
    const active = activeRuns.get(gameKey);
    if (!active) return null;
    try {
      const outputLogPath = path.join(active.run.directory, OUTPUT_LOG);
      const descriptor = fs.openSync(outputLogPath, "a");
      active.outputLogPath = outputLogPath;
      return descriptor;
    } catch (error) {
      logger.warn("Could not open the game output log", { gameKey, error });
      return null;
    }
  },

  note(gameKey: string, message: string) {
    update(gameKey, (active) => {
      active.run.events.push({ at: nowIso(), message });
    });
  },

  markGameDetected(gameKey: string) {
    const active = activeRuns.get(gameKey);
    if (!active || active.run.gameDetected) return;
    // The game outlived its launcher; the run now ends when the game closes.
    if (active.finishTimer) clearTimeout(active.finishTimer);
    active.finishTimer = null;
    update(gameKey, (current) => {
      current.run.gameDetected = true;
    });
  },

  recordExit(
    gameKey: string,
    exit: { code: number | null; signal: string | null }
  ) {
    const active = activeRuns.get(gameKey);
    if (!active) return;
    update(gameKey, (current) => {
      current.run.exitCode = exit.code;
      current.run.signal = exit.signal;
      current.awaitsExit = false;
      if (!current.run.gameDetected) current.exitedAtMs = Date.now();
    });

    if (active.closed) finishRun(gameKey);
    else if (!active.run.gameDetected)
      active.finishTimer ??= setTimeout(
        () => finishRun(gameKey),
        DETECTION_GRACE_MS
      );
  },

  recordLaunchFailure(gameKey: string, message: string) {
    update(gameKey, (active) => {
      active.run.outcome = "launch_failed";
      active.run.events.push({ at: nowIso(), message });
    });
    finishRun(gameKey);
  },

  /** The process watcher saw the game close. */
  recordGameClosed(gameKey: string) {
    const active = activeRuns.get(gameKey);
    if (!active) return;
    active.closed = true;
    update(gameKey, (current) => {
      current.run.endedAt = nowIso();
      current.run.durationInMilliseconds = Date.now() - current.startedAtMs;
    });
    if (!active.awaitsExit) {
      finishRun(gameKey);
      return;
    }
    active.finishTimer ??= setTimeout(() => finishRun(gameKey), EXIT_WAIT_MS);
  },

  list(shop: GameShop, objectId: string): GameRun[] {
    const gameFolder = findGameFolder(shop, objectId);
    if (!gameFolder) return [];
    const gameKey = levelKeys.game(shop, objectId);
    const activeId = activeRuns.get(gameKey)?.run.id;

    return fs
      .readdirSync(gameFolder, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => readRun(path.join(gameFolder, entry.name)))
      .filter((run): run is GameRun => run !== null)
      .map((run) =>
        run.outcome === "running" && run.id !== activeId
          ? { ...run, outcome: "unknown" as const }
          : run
      )
      .sort((a, b) => b.id.localeCompare(a.id));
  },

  /** The newest run, read through the folder's `latest` link without listing them all. */
  getLatest(shop: GameShop, objectId: string): GameRun | null {
    const gameFolder = findGameFolder(shop, objectId);
    if (!gameFolder) return null;
    try {
      const runId = fs.readlinkSync(path.join(gameFolder, LATEST_LINK));
      const run = readRun(path.join(gameFolder, runId));
      if (!run) return null;
      const activeId = activeRuns.get(levelKeys.game(shop, objectId))?.run.id;
      return run.outcome === "running" && run.id !== activeId
        ? { ...run, outcome: "unknown" }
        : run;
    } catch {
      return null;
    }
  },

  getSummary(shop: GameShop, objectId: string, runId: string) {
    const run = GameRuns.list(shop, objectId).find(
      (entry) => entry.id === runId
    );
    return run ? formatRunSummary(run) : null;
  },

  /**
   * Runs a previous Hydra left running (it crashed or was killed) are marked
   * unknown on disk, so `summary.md` stops saying "still running".
   */
  async closeLeftoverRuns() {
    let gameFolders: fs.Dirent[];
    try {
      gameFolders = await fs.promises.readdir(getRunsPath(), {
        withFileTypes: true,
      });
    } catch {
      return;
    }

    const activeIds = new Set(
      [...activeRuns.values()].map((active) => active.run.id)
    );
    for (const gameFolder of gameFolders) {
      if (!gameFolder.isDirectory()) continue;
      const folderPath = path.join(getRunsPath(), gameFolder.name);
      const runFolders = await fs.promises
        .readdir(folderPath, { withFileTypes: true })
        .catch(() => []);
      for (const runFolder of runFolders) {
        if (!runFolder.isDirectory()) continue;
        const run = readRun(path.join(folderPath, runFolder.name));
        if (!run || run.outcome !== "running" || activeIds.has(run.id))
          continue;
        closeLeftoverRun(run, nowIso());
        try {
          writeRun(run);
        } catch (error) {
          logger.warn("Could not close a leftover game run", {
            directory: run.directory,
            error,
          });
        }
      }
    }
  },

  getDirectory(shop: GameShop, objectId: string, runId?: string) {
    const gameFolder = findGameFolder(shop, objectId);
    if (!gameFolder) return null;
    return runId ? path.join(gameFolder, runId) : gameFolder;
  },
};
