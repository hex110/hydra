import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { gamesSublevel, levelKeys } from "@main/level";
import { parseExecutablePath } from "@main/events/helpers/parse-executable-path";
import {
  FILE_EXTENSIONS_TO_EXTRACT,
  getModFolder,
  isFomodArchive,
  planDeployment,
  resolveModLayout,
} from "@shared";
import type {
  GameMods,
  GameShop,
  InstalledMod,
  ModSource,
  NexusGameMatch,
  NexusModRequirement,
  PendingFomodDetails,
  PendingFomodInstall,
  FomodConfig,
} from "@types";

import { SevenZip } from "../7zip";
import { applyFomod, readFomodConfig } from "./fomod";
import { isTrackedGameKeyRunning } from "../game-running-state";
import { logger } from "../logger";
import { SystemPath } from "../system-path";

interface ModsFile {
  mods: InstalledMod[];
  nexusGame: NexusGameMatch | null;
}

interface DeployedFile {
  /** Path in the game folder, relative to it. */
  target: string;
  /** Where the game's own file was moved, relative to the backup folder. */
  backup: string | null;
}

interface DeployState {
  gameFolder: string;
  files: DeployedFile[];
  /** Folders Hydra created for mods, deepest first, removed when empty. */
  createdFolders: string[];
}

export class ModError extends Error {
  constructor(
    public readonly code:
      | "game-running"
      | "no-game-folder"
      | "extract-failed"
      | "empty-archive"
      | "not-found"
  ) {
    super(code);
  }
}

const storeFolder = (shop: GameShop, objectId: string) =>
  path.join(SystemPath.getPath("userData"), "mods", shop, objectId);
const modsFilePath = (folder: string) => path.join(folder, "mods.json");
const deployedFilePath = (folder: string) => path.join(folder, "deployed.json");
const stagingFolder = (folder: string, modId: string) =>
  path.join(folder, "staging", modId);
const backupFolder = (folder: string) => path.join(folder, "backup");
const pendingFolder = (folder: string, id: string) =>
  path.join(folder, "pending", id);
const pendingFilePath = (folder: string, id: string) =>
  path.join(folder, "pending", `${id}.json`);

type InstallDetails = {
  name: string;
  version: string | null;
  source: ModSource;
  /** Replaces this mod (an update), keeping its place and on/off. */
  replaces?: string;
  requirements?: NexusModRequirement[];
};

interface PendingFomodFile extends PendingFomodInstall {
  details: InstallDetails;
  /** The folder holding `fomod/`, relative to the pending folder. */
  root: string;
  config: FomodConfig;
}

const readJson = async <T>(filePath: string, fallback: T): Promise<T> => {
  try {
    return JSON.parse(await fs.promises.readFile(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
};

const writeJson = async (filePath: string, value: unknown) => {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  await fs.promises.writeFile(temporary, JSON.stringify(value, null, 2));
  await fs.promises.rename(temporary, filePath);
};

const exists = (target: string) =>
  fs.promises.lstat(target).then(
    () => true,
    () => false
  );

/** Files under a folder, relative to it, `/`-separated. */
const listFiles = async (root: string, prefix = ""): Promise<string[]> => {
  const entries = await fs.promises
    .readdir(path.join(root, prefix), { withFileTypes: true })
    .catch(() => [] as fs.Dirent[]);
  const files: string[] = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...(await listFiles(root, relative)));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
};

/**
 * The folder a game's mods go into: the executable's folder, or the game
 * root for Unreal games started from `<Project>/Binaries/Win64`.
 */
export const resolveModGameFolder = (executablePath: string | null) => {
  if (!executablePath) return null;
  const directory = path.dirname(parseExecutablePath(executablePath));
  return /[\\/]binaries[\\/]win(64|32)$/i.test(directory)
    ? path.resolve(directory, "..", "..", "..")
    : directory;
};

/**
 * The real path for a `/`-separated target under `root`, matching existing
 * folders and files whatever their case: Windows mods name `Data` as `data`,
 * and Linux filesystems are case-sensitive.
 */
const resolveCaseInsensitive = async (root: string, target: string) => {
  let current = root;
  const segments = target.split("/");
  for (const [index, segment] of segments.entries()) {
    const entries = await fs.promises.readdir(current).catch(() => null);
    const match =
      entries?.find((entry) => entry === segment) ??
      entries?.find((entry) => entry.toLowerCase() === segment.toLowerCase());
    if (!match) return path.join(current, ...segments.slice(index));
    current = path.join(current, match);
  }
  return current;
};

const linkOrCopy = async (source: string, destination: string) => {
  try {
    await fs.promises.link(source, destination);
  } catch {
    await fs.promises.copyFile(source, destination);
  }
};

const queues = new Map<string, Promise<unknown>>();

/** Runs one change to a game's mods at a time. */
const serialize = <T>(key: string, task: () => Promise<T>): Promise<T> => {
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.then(task, task);
  queues.set(
    key,
    next.catch(() => undefined)
  );
  return next;
};

export class ModStore {
  private static async loadGame(shop: GameShop, objectId: string) {
    const game = await gamesSublevel.get(levelKeys.game(shop, objectId));
    if (!game) throw new ModError("not-found");
    return game;
  }

  private static readMods(folder: string) {
    return readJson<ModsFile>(modsFilePath(folder), {
      mods: [],
      nexusGame: null,
    });
  }

  public static async getGameMods(
    shop: GameShop,
    objectId: string
  ): Promise<GameMods> {
    const game = await this.loadGame(shop, objectId);
    const folder = storeFolder(shop, objectId);
    const { mods, nexusGame } = await this.readMods(folder);
    return {
      gameFolder: resolveModGameFolder(game.executablePath ?? null),
      mods,
      nexusGame,
      overridden: planDeployment(mods).overridden,
      pendingFomods: (await this.readPendingFomods(folder)).map(
        ({ id, name, version, moduleName, createdAt }) => ({
          id,
          name,
          version,
          moduleName,
          createdAt,
        })
      ),
    };
  }

  public static async setNexusGame(
    shop: GameShop,
    objectId: string,
    nexusGame: NexusGameMatch | null
  ) {
    const folder = storeFolder(shop, objectId);
    return serialize(folder, async () => {
      const state = await this.readMods(folder);
      await writeJson(modsFilePath(folder), { ...state, nexusGame });
    });
  }

  /** Takes every deployed mod file out of the game and restores its files. */
  private static async undeploy(folder: string) {
    const deployed = await readJson<DeployState | null>(
      deployedFilePath(folder),
      null
    );
    if (!deployed) return;

    for (const file of deployed.files) {
      const target = path.join(deployed.gameFolder, file.target);
      await fs.promises.rm(target, { force: true });
      if (file.backup) {
        const backup = path.join(backupFolder(folder), file.backup);
        if (await exists(backup)) {
          await fs.promises.mkdir(path.dirname(target), { recursive: true });
          await fs.promises.rename(backup, target);
        }
      }
    }
    for (const created of deployed.createdFolders) {
      await fs.promises.rmdir(created).catch(() => undefined);
    }
    await fs.promises.rm(backupFolder(folder), {
      recursive: true,
      force: true,
    });
    await fs.promises.rm(deployedFilePath(folder), { force: true });
  }

  private static async deploy(
    folder: string,
    gameFolder: string,
    mods: InstalledMod[]
  ) {
    await this.undeploy(folder);

    const plan = planDeployment(mods);
    const files: DeployedFile[] = [];
    const createdFolders = new Set<string>();

    // Recorded as it goes, so a failure halfway can still be undone.
    const record = () =>
      writeJson(deployedFilePath(folder), {
        gameFolder,
        files,
        createdFolders: [...createdFolders].toSorted(
          (a, b) => b.length - a.length
        ),
      } satisfies DeployState);

    try {
      for (const entry of plan.files.values()) {
        const source = path.join(
          stagingFolder(folder, entry.modId),
          entry.file
        );
        const destination = await resolveCaseInsensitive(
          gameFolder,
          entry.target
        );
        const relative = path.relative(gameFolder, destination);

        for (
          let parent = path.dirname(destination);
          parent.startsWith(gameFolder) && parent !== gameFolder;
          parent = path.dirname(parent)
        ) {
          if (!(await exists(parent))) createdFolders.add(parent);
        }
        await fs.promises.mkdir(path.dirname(destination), { recursive: true });

        let backup: string | null = null;
        if (await exists(destination)) {
          backup = relative;
          const backupPath = path.join(backupFolder(folder), backup);
          await fs.promises.mkdir(path.dirname(backupPath), {
            recursive: true,
          });
          await fs.promises.rename(destination, backupPath);
        }
        files.push({ target: relative, backup });
        await linkOrCopy(source, destination);
      }
    } finally {
      await record();
    }
  }

  private static async change(
    shop: GameShop,
    objectId: string,
    update: (state: ModsFile) => Promise<ModsFile> | ModsFile
  ) {
    const gameKey = levelKeys.game(shop, objectId);
    const folder = storeFolder(shop, objectId);
    return serialize(folder, async () => {
      if (isTrackedGameKeyRunning(gameKey)) throw new ModError("game-running");
      const game = await this.loadGame(shop, objectId);
      const gameFolder = resolveModGameFolder(game.executablePath ?? null);
      if (!gameFolder) throw new ModError("no-game-folder");

      const state = await update(await this.readMods(folder));
      await writeJson(modsFilePath(folder), state);
      await this.deploy(folder, gameFolder, state.mods);
      return state;
    });
  }

  /** Unpacks an archive (or takes a single file) into a new staged mod. */
  public static async installFromFile(
    shop: GameShop,
    objectId: string,
    filePath: string,
    details: InstallDetails
  ): Promise<InstalledMod | null> {
    const game = await this.loadGame(shop, objectId);
    const gameFolder = resolveModGameFolder(game.executablePath ?? null);
    if (!gameFolder) throw new ModError("no-game-folder");

    const folder = storeFolder(shop, objectId);
    const id = randomUUID();
    const partial = path.join(folder, "staging", `${id}.partial`);
    await fs.promises.mkdir(partial, { recursive: true });

    try {
      const isArchive = FILE_EXTENSIONS_TO_EXTRACT.some((extension) =>
        filePath.toLowerCase().endsWith(extension)
      );
      if (isArchive) {
        const result = await SevenZip.extractFile({
          filePath,
          outputPath: partial,
        });
        if (!result.success) throw new ModError("extract-failed");
      } else {
        await fs.promises.copyFile(
          filePath,
          path.join(partial, path.basename(filePath))
        );
      }

      const extracted = await listFiles(partial);
      if (extracted.length === 0) throw new ModError("empty-archive");

      // A FOMOD installer waits for the user's choices (completeFomod).
      const fomod = await readFomodConfig(partial, extracted).catch((error) => {
        logger.warn("[Mods] Could not read the FOMOD installer", error);
        return null;
      });
      if (fomod) {
        const pending: PendingFomodFile = {
          id,
          name: details.name,
          version: details.version,
          moduleName: fomod.config.moduleName,
          createdAt: Date.now(),
          details,
          root: path.relative(partial, fomod.root),
          config: fomod.config,
        };
        await fs.promises.mkdir(path.join(folder, "pending"), {
          recursive: true,
        });
        await fs.promises.rename(partial, pendingFolder(folder, id));
        await fs.promises.writeFile(
          pendingFilePath(folder, id),
          JSON.stringify(pending)
        );
        logger.info("[Mods] FOMOD installer waits for options", {
          gameKey: levelKeys.game(shop, objectId),
          name: details.name,
          steps: fomod.config.steps.length,
        });
        return null;
      }

      const { nexusGame } = await this.readMods(folder);
      const gameRootEntries = new Set(
        (await fs.promises.readdir(gameFolder).catch(() => [])).map((entry) =>
          entry.toLowerCase()
        )
      );
      const layout = resolveModLayout({
        files: extracted,
        modFolder: getModFolder(nexusGame?.domainName),
        gameRootEntries,
      });

      const root = layout.stripPrefix
        ? path.join(partial, layout.stripPrefix)
        : partial;
      return await this.recordInstall(shop, objectId, folder, id, root, {
        details,
        deployRoot: layout.deployRoot,
        fomod: isFomodArchive(extracted) ? "default" : undefined,
      });
    } finally {
      await fs.promises.rm(partial, { recursive: true, force: true });
    }
  }

  private static async readPendingFomods(folder: string) {
    const entries = await fs.promises
      .readdir(path.join(folder, "pending"))
      .catch(() => [] as string[]);
    const pending: PendingFomodFile[] = [];
    for (const entry of entries.filter((name) => name.endsWith(".json"))) {
      const file = await readJson<PendingFomodFile | null>(
        path.join(folder, "pending", entry),
        null
      );
      if (file?.id) pending.push(file);
    }
    return pending.sort((a, b) => a.createdAt - b.createdAt);
  }

  public static async getPendingFomod(
    shop: GameShop,
    objectId: string,
    pendingId: string
  ): Promise<PendingFomodDetails> {
    const folder = storeFolder(shop, objectId);
    const pending = await readJson<PendingFomodFile | null>(
      pendingFilePath(folder, pendingId),
      null
    );
    if (!pending) throw new ModError("not-found");
    return {
      id: pending.id,
      name: pending.name,
      version: pending.version,
      moduleName: pending.moduleName,
      createdAt: pending.createdAt,
      config: pending.config,
      imageRoot: path.join(pendingFolder(folder, pendingId), pending.root),
    };
  }

  public static async cancelFomod(
    shop: GameShop,
    objectId: string,
    pendingId: string
  ) {
    const folder = storeFolder(shop, objectId);
    await fs.promises.rm(pendingFolder(folder, pendingId), {
      recursive: true,
      force: true,
    });
    await fs.promises.rm(pendingFilePath(folder, pendingId), { force: true });
  }

  /** Installs a pending FOMOD with the plugins the user picked. */
  public static async completeFomod(
    shop: GameShop,
    objectId: string,
    pendingId: string,
    selected: string[]
  ): Promise<InstalledMod> {
    const folder = storeFolder(shop, objectId);
    const pending = await readJson<PendingFomodFile | null>(
      pendingFilePath(folder, pendingId),
      null
    );
    if (!pending) throw new ModError("not-found");
    const game = await this.loadGame(shop, objectId);
    if (!resolveModGameFolder(game.executablePath ?? null))
      throw new ModError("no-game-folder");

    const partial = path.join(folder, "staging", `${pendingId}.partial`);
    try {
      const missing = await applyFomod(
        path.join(pendingFolder(folder, pendingId), pending.root),
        pending.config,
        new Set(selected),
        partial
      );
      if (missing.length > 0) {
        logger.warn("[Mods] FOMOD files not found in the archive", missing);
      }
      if ((await listFiles(partial)).length === 0)
        throw new ModError("empty-archive");

      const { nexusGame } = await this.readMods(folder);
      const mod = await this.recordInstall(
        shop,
        objectId,
        folder,
        pendingId,
        partial,
        {
          details: pending.details,
          deployRoot: getModFolder(nexusGame?.domainName),
          fomod: "chosen",
        }
      );
      await this.cancelFomod(shop, objectId, pendingId);
      return mod;
    } finally {
      await fs.promises.rm(partial, { recursive: true, force: true });
    }
  }

  /** Moves a prepared folder into staging and adds (or swaps in) the mod. */
  private static async recordInstall(
    shop: GameShop,
    objectId: string,
    folder: string,
    id: string,
    preparedFolder: string,
    options: {
      details: InstallDetails;
      deployRoot: string;
      fomod?: "default" | "chosen";
    }
  ): Promise<InstalledMod> {
    const { details } = options;
    const staging = stagingFolder(folder, id);
    await fs.promises.rename(preparedFolder, staging);

    const mod: InstalledMod = {
      id,
      name: details.name,
      version: details.version,
      source: details.source,
      enabled: true,
      deployRoot: options.deployRoot,
      files: await listFiles(staging),
      installedAt: Date.now(),
      update: null,
      fomod: options.fomod === "default" || undefined,
      fomodChosen: options.fomod === "chosen" || undefined,
      requirements: details.requirements?.length
        ? details.requirements
        : undefined,
    };

    let replaced: InstalledMod | undefined;
    await this.change(shop, objectId, (state) => {
      replaced = details.replaces
        ? state.mods.find((existing) => existing.id === details.replaces)
        : undefined;
      if (!replaced) return { ...state, mods: [...state.mods, mod] };
      return {
        ...state,
        mods: state.mods.map((existing) =>
          existing.id === replaced!.id
            ? { ...mod, enabled: existing.enabled }
            : existing
        ),
      };
    });
    if (replaced) {
      await fs.promises.rm(stagingFolder(folder, replaced.id), {
        recursive: true,
        force: true,
      });
    }

    logger.info("[Mods] Installed", {
      gameKey: levelKeys.game(shop, objectId),
      name: mod.name,
      files: mod.files.length,
      deployRoot: mod.deployRoot,
    });
    return mod;
  }

  public static setEnabled(
    shop: GameShop,
    objectId: string,
    modId: string,
    enabled: boolean
  ) {
    return this.change(shop, objectId, (state) => ({
      ...state,
      mods: state.mods.map((mod) =>
        mod.id === modId ? { ...mod, enabled } : mod
      ),
    }));
  }

  /** Moves a mod one place up or down; lower in the list wins conflicts. */
  public static move(
    shop: GameShop,
    objectId: string,
    modId: string,
    direction: -1 | 1
  ) {
    return this.change(shop, objectId, (state) => {
      const mods = [...state.mods];
      const index = mods.findIndex((mod) => mod.id === modId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= mods.length) return state;
      [mods[index], mods[target]] = [mods[target], mods[index]];
      return { ...state, mods };
    });
  }

  public static async remove(shop: GameShop, objectId: string, modId: string) {
    await this.change(shop, objectId, (state) => ({
      ...state,
      mods: state.mods.filter((mod) => mod.id !== modId),
    }));
    await fs.promises.rm(stagingFolder(storeFolder(shop, objectId), modId), {
      recursive: true,
      force: true,
    });
  }

  public static async setUpdates(
    shop: GameShop,
    objectId: string,
    updates: Map<string, InstalledMod["update"]>
  ) {
    const folder = storeFolder(shop, objectId);
    await serialize(folder, async () => {
      const state = await this.readMods(folder);
      await writeJson(modsFilePath(folder), {
        ...state,
        mods: state.mods.map((mod) =>
          updates.has(mod.id) ? { ...mod, update: updates.get(mod.id) } : mod
        ),
      });
    });
  }

  /** A folder for downloads on the way into staging. */
  public static downloadFolder(shop: GameShop, objectId: string) {
    return path.join(storeFolder(shop, objectId), "downloads");
  }

  /** Every enabled mod, for run records. */
  public static async listEnabled(shop: GameShop, objectId: string) {
    const { mods } = await this.readMods(storeFolder(shop, objectId));
    return mods.filter((mod) => mod.enabled);
  }
}
