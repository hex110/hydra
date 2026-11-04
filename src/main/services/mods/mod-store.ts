import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { gamesSublevel, levelKeys } from "@main/level";
import { parseExecutablePath } from "@main/events/helpers/parse-executable-path";
import {
  FILE_EXTENSIONS_TO_EXTRACT,
  MOD_LOADERS,
  defaultModFolder,
  describeModLayout,
  detectModLoader,
  findNeededLoader,
  findProxyDllClash,
  getModFolder,
  planModPlacement,
  planModFiles,
  isFomodArchive,
  applyModProfile,
  planDeployment,
  resolveModLayout,
  snapshotModProfile,
} from "@shared";
import type {
  Game,
  GameMods,
  GameShop,
  GameSupportDefinition,
  InstalledModLoader,
  ModGameSupport,
  ModPlayMode,
  InstalledMod,
  ModSource,
  NexusGameMatch,
  ModProfile,
  NexusModRequirement,
  PendingFomodDetails,
  PendingFomodInstall,
  FomodConfig,
} from "@types";

import { SevenZip } from "../7zip";
import { MAX_PLAN_FILES, ModActivity } from "./activity";
import { applyFomod, readFomodConfig } from "./fomod";
import { readRootEntries, resolveGameSupportDefinition } from "./games";
import { OptiScaler } from "../optiscaler/optiscaler";
import { RenoDx } from "../renodx/renodx";
import { isTrackedGameKeyRunning } from "../game-running-state";
import { logger } from "../logger";
import { SystemPath } from "../system-path";

interface ModsFile {
  mods: InstalledMod[];
  nexusGame: NexusGameMatch | null;
  profiles?: ModProfile[];
  /** The profile the live list belongs to; every change is saved into it. */
  activeProfileId?: string | null;
  /** What Play does for this game; modded unless the user picked Play. */
  playMode?: ModPlayMode;
  /** The "back up saves before the first modded launch" offer was shown. */
  saveBackupOffered?: boolean;
}

interface DeployedFile {
  /** Path in the game folder, relative to it. */
  target: string;
  /** Where the game's own file was moved, relative to the backup folder. */
  backup: string | null;
  /** Hard link, or a copy when staging is on another filesystem. */
  method?: "link" | "copy";
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
      | "proxy-dll-clash",
    /** A sentence for the activity log. */
    public readonly detail?: string
  ) {
    super(detail ?? code);
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

const linkOrCopy = async (
  source: string,
  destination: string
): Promise<"link" | "copy"> => {
  try {
    await fs.promises.link(source, destination);
    return "link";
  } catch {
    await fs.promises.copyFile(source, destination);
    return "copy";
  }
};

/** "1 file", "2 files": the activity log is English for people and agents. */
const count = (amount: number, noun: string) =>
  `${amount} ${noun}${amount === 1 ? "" : "s"}`;

/** Where a game's mods go when Hydra has no definition for it. */
export const resolveModSupport = (
  nexusDomain: string | null | undefined
): ModGameSupport => {
  const modFolder = getModFolder(nexusDomain);
  return {
    kind: "fallback",
    modFolder,
    source: nexusDomain && modFolder !== "" ? "mod-folder-table" : "game-root",
  };
};

/** The enabled mod that is the game's loader; the first in the list wins. */
const findEnabledLoader = (mods: InstalledMod[]) =>
  mods.find((mod) => mod.enabled && mod.loader) ?? null;

const describeSupport = (
  definition: GameSupportDefinition | null,
  nexusDomain: string | null | undefined,
  mods: InstalledMod[]
): ModGameSupport => {
  if (!definition) return resolveModSupport(nexusDomain);
  const loader = definition.loader;
  return {
    kind: "definition",
    id: definition.id,
    name: definition.name,
    origin: definition.origin,
    source: definition.source,
    modFolder: defaultModFolder(definition),
    loader: loader
      ? {
          kind: loader.kind,
          name: loader.name,
          installed: mods.some(
            (mod) => mod.enabled && mod.loader?.kind === loader.kind
          ),
        }
      : null,
    unsupportedLoader: definition.unsupportedLoader ?? null,
  };
};

/** Other tools in the game that load a proxy DLL from its folder. */
const proxyDllUsers = (game: Game) => [
  { tool: "OptiScaler", dll: OptiScaler.getLaunchNativeDll(game) },
  { tool: "ReShade (RenoDX)", dll: RenoDx.getLaunchNativeDll(game) },
  ...(game.onlineFixDisabled === true
    ? []
    : (game.onlineFix?.proxyDlls ?? []).map((dll) => ({
        tool: "OnlineFix",
        dll,
      }))),
];

/** Refuses a loader whose proxy DLL another tool in the game already uses. */
const checkProxyDlls = (game: Game, loader: InstalledModLoader) => {
  const clash = findProxyDllClash(loader.nativeDlls, proxyDllUsers(game));
  if (clash) {
    const dll = `${clash.dll!.replace(/\.dll$/i, "")}.dll`;
    throw new ModError(
      "proxy-dll-clash",
      `${MOD_LOADERS[loader.kind].name} loads through ${dll}, which ${clash.tool} already uses in this game. Remove ${clash.tool} or move it to another DLL first.`
    );
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
    const { mods, nexusGame, profiles, activeProfileId, playMode } =
      await this.readMods(folder);
    const gameFolder = resolveModGameFolder(game.executablePath ?? null);
    const definition = await this.resolveDefinition(
      game,
      gameFolder,
      nexusGame
    );
    const loaderMod = findEnabledLoader(mods);
    return {
      gameFolder,
      blocker: !gameFolder
        ? "no-executable"
        : isTrackedGameKeyRunning(levelKeys.game(shop, objectId))
          ? "game-running"
          : null,
      support: describeSupport(definition, nexusGame?.domainName, mods),
      playMode: playMode ?? "modded",
      loader: loaderMod
        ? { name: loaderMod.name, version: loaderMod.version }
        : null,
      loaderMissing: mods.some(
        (mod) =>
          mod.enabled &&
          mod.needsLoader &&
          !mods.some(
            (other) => other.enabled && other.loader?.kind === mod.needsLoader
          )
      ),
      mods,
      nexusGame,
      profiles: (profiles ?? []).map(({ id, name }) => ({ id, name })),
      activeProfileId: activeProfileId ?? null,
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

  private static resolveDefinition(
    game: Game,
    gameFolder: string | null,
    nexusGame: NexusGameMatch | null
  ) {
    return resolveGameSupportDefinition({
      game,
      gameFolder,
      nexusDomain: nexusGame?.domainName ?? null,
    }).catch((error) => {
      logger.warn("[Mods] Could not resolve the game's support", error);
      return null;
    });
  }

  /** The definition Hydra uses for a game, for installs and reports. */
  public static async getDefinition(shop: GameShop, objectId: string) {
    const game = await this.loadGame(shop, objectId);
    const { nexusGame } = await this.readMods(storeFolder(shop, objectId));
    return this.resolveDefinition(
      game,
      resolveModGameFolder(game.executablePath ?? null),
      nexusGame
    );
  }

  public static async setNexusGame(
    shop: GameShop,
    objectId: string,
    nexusGame: NexusGameMatch | null
  ) {
    const folder = storeFolder(shop, objectId);
    await serialize(folder, async () => {
      const state = await this.readMods(folder);
      await writeJson(modsFilePath(folder), { ...state, nexusGame });
    });
    await ModActivity.append(shop, objectId, {
      kind: "nexus-match",
      message: nexusGame
        ? `Matched to ${nexusGame.name} on Nexus Mods (${nexusGame.domainName}).`
        : "Cleared the Nexus Mods match.",
    });
  }

  /** Takes every deployed mod file out of the game and restores its files. */
  private static async undeploy(folder: string) {
    const deployed = await readJson<DeployState | null>(
      deployedFilePath(folder),
      null
    );
    if (!deployed) return null;

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
    return {
      removed: deployed.files.length,
      restored: deployed.files.filter((file) => file.backup).length,
    };
  }

  /** What `deployed.json` holds, counted, for reports. */
  public static async getDeployedSummary(shop: GameShop, objectId: string) {
    const deployed = await readJson<DeployState | null>(
      deployedFilePath(storeFolder(shop, objectId)),
      null
    );
    if (!deployed || deployed.files.length === 0) return null;
    return {
      files: deployed.files.length,
      linked: deployed.files.filter((file) => file.method !== "copy").length,
      copied: deployed.files.filter((file) => file.method === "copy").length,
      backedUp: deployed.files.filter((file) => file.backup).length,
    };
  }

  private static async deploy(
    shop: GameShop,
    objectId: string,
    folder: string,
    gameFolder: string,
    mods: InstalledMod[]
  ) {
    const undeployed = await this.undeploy(folder);
    if (undeployed && undeployed.removed > 0)
      await ModActivity.append(shop, objectId, {
        kind: "undeploy",
        message: `Took ${count(undeployed.removed, "mod file")} out of the game folder and put back ${count(undeployed.restored, "file")} of the game's own.`,
        details: undeployed,
      });

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
        const method = await linkOrCopy(source, destination);
        files.push({ target: relative, backup, method });
      }
    } finally {
      await record();
    }

    const linked = files.filter((file) => file.method === "link").length;
    const backedUp = files.filter((file) => file.backup).length;
    if (files.length > 0)
      await ModActivity.append(shop, objectId, {
        kind: "deploy",
        message: `Deployed ${count(files.length, "file")} from ${count(mods.filter((mod) => mod.enabled).length, "mod")}: ${count(linked, "hard link")}, ${count(files.length - linked, "copy").replace("copys", "copies")}, ${count(backedUp, "file")} of the game's own backed up.`,
        details: {
          gameFolder,
          files: files.length,
          linked,
          copied: files.length - linked,
          backedUp,
          backups: files
            .filter((file) => file.backup)
            .slice(0, MAX_PLAN_FILES)
            .map((file) => file.target),
        },
      });
    const names = new Map(mods.map((mod) => [mod.id, mod.name]));
    for (const [modId, targets] of Object.entries(plan.overridden))
      await ModActivity.append(shop, objectId, {
        kind: "conflicts",
        modId,
        modName: names.get(modId),
        message: `${targets.length === 1 ? "1 of its files is" : `${targets.length} of its files are`} replaced by a mod lower in the list.`,
        details: { files: targets.slice(0, MAX_PLAN_FILES) },
      });
  }

  private static async change(
    shop: GameShop,
    objectId: string,
    update: (state: ModsFile) => Promise<ModsFile> | ModsFile,
    action = "change the mod list"
  ) {
    const folder = storeFolder(shop, objectId);
    return serialize(folder, async () => {
      try {
        return await this.applyChange(shop, objectId, folder, update);
      } catch (error) {
        await ModActivity.append(shop, objectId, {
          kind: "error",
          message: `Could not ${action}: ${error instanceof ModError ? (error.detail ?? error.code) : error instanceof Error ? error.message : String(error)}`,
        });
        throw error;
      }
    });
  }

  private static async applyChange(
    shop: GameShop,
    objectId: string,
    folder: string,
    update: (state: ModsFile) => Promise<ModsFile> | ModsFile
  ) {
    const gameKey = levelKeys.game(shop, objectId);
    if (isTrackedGameKeyRunning(gameKey)) throw new ModError("game-running");
    const game = await this.loadGame(shop, objectId);
    const gameFolder = resolveModGameFolder(game.executablePath ?? null);
    if (!gameFolder) throw new ModError("no-game-folder");

    const updated = await update(await this.readMods(folder));
    const state: ModsFile = updated.activeProfileId
      ? {
          ...updated,
          profiles: (updated.profiles ?? []).map((profile) =>
            profile.id === updated.activeProfileId
              ? { ...profile, entries: snapshotModProfile(updated.mods) }
              : profile
          ),
        }
      : updated;
    await writeJson(modsFilePath(folder), state);
    await this.deploy(shop, objectId, folder, gameFolder, state.mods);
    return state;
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
        await ModActivity.append(shop, objectId, {
          kind: "fomod-waiting",
          modName: details.name,
          message: `The archive is a FOMOD installer (${fomod.config.moduleName}, ${fomod.config.steps.length} pages); it waits for your options.`,
          details: { files: extracted.length },
        });
        return null;
      }

      const { nexusGame } = await this.readMods(folder);
      const gameRootEntries = await readRootEntries(gameFolder);
      const definition = await this.resolveDefinition(
        game,
        gameFolder,
        nexusGame
      );

      if (definition) {
        const placement = planModPlacement({
          files: extracted,
          definition,
          gameRootEntries,
          modName: details.name,
        });
        if (placement.files.length === 0) throw new ModError("empty-archive");
        await ModActivity.append(shop, objectId, {
          kind: "install-plan",
          modId: id,
          modName: details.name,
          message: `Placing ${count(placement.files.length, "file")} by the game definition ${definition.name}: ${placement.description}.`,
          details: {
            rule: "game-definition",
            definition: definition.id,
            definitionSource: definition.source,
            files: placement.files
              .slice(0, MAX_PLAN_FILES)
              .map((file) => `${file.archive} -> ${file.target}`),
            more: Math.max(0, placement.files.length - MAX_PLAN_FILES),
            leftOut: placement.skipped.slice(0, MAX_PLAN_FILES),
          },
        });
        // Staged in the game folder's layout, so the mod deploys to its root.
        const prepared = path.join(folder, "staging", `${id}.prepared`);
        await fs.promises.rm(prepared, { recursive: true, force: true });
        try {
          for (const file of placement.files) {
            const destination = path.join(prepared, file.target);
            await fs.promises.mkdir(path.dirname(destination), {
              recursive: true,
            });
            await fs.promises.rename(
              path.join(partial, file.archive),
              destination
            );
          }
          const targets = placement.files.map((file) => file.target);
          return await this.recordInstall(
            shop,
            objectId,
            folder,
            id,
            prepared,
            {
              details,
              deployRoot: "",
              game,
              loader: detectModLoader(targets),
              needsLoader: findNeededLoader(targets, definition.loader?.kind),
            }
          );
        } finally {
          await fs.promises.rm(prepared, { recursive: true, force: true });
        }
      }

      const layout = resolveModLayout({
        files: extracted,
        modFolder: getModFolder(nexusGame?.domainName),
        gameRootEntries,
      });

      const modFolder = getModFolder(nexusGame?.domainName);
      const planned = planModFiles(extracted, layout);
      await ModActivity.append(shop, objectId, {
        kind: "install-plan",
        modId: id,
        modName: details.name,
        message: `Placing ${count(extracted.length, "file")} by layout guess: ${describeModLayout(layout, modFolder)}.`,
        details: {
          rule: "layout-guess",
          modFolder,
          modFolderFrom: resolveModSupport(nexusGame?.domainName).source,
          stripPrefix: layout.stripPrefix,
          deployRoot: layout.deployRoot,
          files: planned
            .slice(0, MAX_PLAN_FILES)
            .map((file) => `${file.archive} -> ${file.target}`),
          more: Math.max(0, planned.length - MAX_PLAN_FILES),
        },
      });

      const root = layout.stripPrefix
        ? path.join(partial, layout.stripPrefix)
        : partial;
      return await this.recordInstall(shop, objectId, folder, id, root, {
        details,
        deployRoot: layout.deployRoot,
        fomod: isFomodArchive(extracted) ? "default" : undefined,
        game,
        loader: detectModLoader(planned.map((file) => file.target)),
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
      const staged = await listFiles(partial);
      const deployRoot = getModFolder(nexusGame?.domainName);
      await ModActivity.append(shop, objectId, {
        kind: "install-plan",
        modId: pendingId,
        modName: pending.name,
        message: `Placing ${count(staged.length, "file")} from the FOMOD options you picked into ${deployRoot || "the game folder"}.`,
        details: {
          rule: "fomod",
          options: selected,
          missing,
          files: staged
            .slice(0, MAX_PLAN_FILES)
            .map(
              (file) =>
                `${file} -> ${[deployRoot, file].filter(Boolean).join("/")}`
            ),
          more: Math.max(0, staged.length - MAX_PLAN_FILES),
        },
      });
      const mod = await this.recordInstall(
        shop,
        objectId,
        folder,
        pendingId,
        partial,
        {
          details: pending.details,
          deployRoot,
          fomod: "chosen",
          game,
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
      game: Game;
      loader?: InstalledModLoader | null;
      needsLoader?: InstalledMod["needsLoader"] | null;
    }
  ): Promise<InstalledMod> {
    const { details } = options;
    if (options.loader) checkProxyDlls(options.game, options.loader);
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
      loader: options.loader ?? undefined,
      needsLoader: (!options.loader && options.needsLoader) || undefined,
    };

    let replaced: InstalledMod | undefined;
    await this.change(
      shop,
      objectId,
      (state) => {
        replaced = details.replaces
          ? state.mods.find((existing) => existing.id === details.replaces)
          : undefined;
        // A loader goes first, so the mods after it win the files they share.
        if (!replaced)
          return {
            ...state,
            mods: mod.loader ? [mod, ...state.mods] : [...state.mods, mod],
          };
        return {
          ...state,
          mods: state.mods.map((existing) =>
            existing.id === replaced!.id
              ? { ...mod, enabled: existing.enabled }
              : existing
          ),
        };
      },
      `install ${mod.name}`
    );
    if (replaced) {
      await fs.promises.rm(stagingFolder(folder, replaced.id), {
        recursive: true,
        force: true,
      });
    }

    if (mod.loader)
      await ModActivity.append(shop, objectId, {
        kind: "loader",
        modId: mod.id,
        modName: mod.name,
        message: `${mod.name} is the game's ${MOD_LOADERS[mod.loader.kind].name} loader; Play (modded) loads it through ${mod.loader.nativeDlls.map((dll) => `${dll}.dll`).join(", ")}.`,
        details: { loader: mod.loader },
      });
    logger.info("[Mods] Installed", {
      gameKey: levelKeys.game(shop, objectId),
      name: mod.name,
      files: mod.files.length,
      deployRoot: mod.deployRoot,
    });
    await ModActivity.append(shop, objectId, {
      kind: "installed",
      modId: mod.id,
      modName: mod.name,
      message: replaced
        ? `Updated from ${replaced.version ?? "the old file"} to ${mod.version ?? "the new file"}.`
        : `Installed${mod.version ? ` version ${mod.version}` : ""}, ${count(mod.files.length, "file")} into ${mod.deployRoot || "the game folder"}.`,
      details: {
        source: mod.source,
        version: mod.version,
        files: mod.files.length,
        requirements: mod.requirements?.map((item) => item.name),
      },
    });
    return mod;
  }

  /**
   * Saves the current list as a new profile and makes it active. The first
   * profile also keeps the list as it was, as "Default".
   */
  public static createProfile(
    shop: GameShop,
    objectId: string,
    name: string,
    defaultName: string
  ) {
    return this.change(
      shop,
      objectId,
      (state) => {
        const profiles = [...(state.profiles ?? [])];
        if (profiles.length === 0) {
          profiles.push({
            id: randomUUID(),
            name: defaultName,
            entries: snapshotModProfile(state.mods),
          });
        }
        const profile: ModProfile = {
          id: randomUUID(),
          name: name.trim() || defaultName,
          entries: snapshotModProfile(state.mods),
        };
        void ModActivity.append(shop, objectId, {
          kind: "profile",
          message: `Created the profile ${profile.name} and made it active.`,
        });
        return {
          ...state,
          profiles: [...profiles, profile],
          activeProfileId: profile.id,
        };
      },
      "create a profile"
    );
  }

  /** Deploys another profile's list; the current one was saved as it changed. */
  public static switchProfile(
    shop: GameShop,
    objectId: string,
    profileId: string
  ) {
    return this.change(
      shop,
      objectId,
      (state) => {
        const profile = state.profiles?.find((item) => item.id === profileId);
        if (!profile) throw new ModError("not-found");
        void ModActivity.append(shop, objectId, {
          kind: "profile",
          message: `Switched to the profile ${profile.name}.`,
        });
        return {
          ...state,
          mods: applyModProfile(state.mods, profile.entries),
          activeProfileId: profile.id,
        };
      },
      "switch profiles"
    );
  }

  /** Deletes a profile; deleting the active one switches to the first left. */
  public static deleteProfile(
    shop: GameShop,
    objectId: string,
    profileId: string
  ) {
    return this.change(
      shop,
      objectId,
      (state) => {
        const profiles = (state.profiles ?? []).filter(
          (item) => item.id !== profileId
        );
        if (state.activeProfileId !== profileId) return { ...state, profiles };
        const next = profiles[0];
        void ModActivity.append(shop, objectId, {
          kind: "profile",
          message: next
            ? `Deleted the active profile; switched to ${next.name}.`
            : "Deleted the last profile.",
        });
        return {
          ...state,
          profiles,
          mods: next ? applyModProfile(state.mods, next.entries) : state.mods,
          activeProfileId: next?.id ?? null,
        };
      },
      "delete a profile"
    );
  }

  public static setEnabled(
    shop: GameShop,
    objectId: string,
    modId: string,
    enabled: boolean
  ) {
    return this.change(
      shop,
      objectId,
      async (state) => {
        const mod = state.mods.find((item) => item.id === modId);
        if (!mod) throw new ModError("not-found");
        if (enabled && mod.loader)
          checkProxyDlls(await this.loadGame(shop, objectId), mod.loader);
        void ModActivity.append(shop, objectId, {
          kind: enabled ? "enabled" : "disabled",
          modId,
          modName: mod.name,
          message: enabled ? "Turned on." : "Turned off.",
        });
        return {
          ...state,
          mods: state.mods.map((item) =>
            item.id === modId ? { ...item, enabled } : item
          ),
        };
      },
      enabled ? "turn a mod on" : "turn a mod off"
    );
  }

  /** Moves a mod one place up or down; lower in the list wins conflicts. */
  public static move(
    shop: GameShop,
    objectId: string,
    modId: string,
    direction: -1 | 1
  ) {
    return this.change(
      shop,
      objectId,
      (state) => {
        const mods = [...state.mods];
        const index = mods.findIndex((mod) => mod.id === modId);
        const target = index + direction;
        if (index < 0 || target < 0 || target >= mods.length) return state;
        [mods[index], mods[target]] = [mods[target], mods[index]];
        void ModActivity.append(shop, objectId, {
          kind: "moved",
          modId,
          modName: mods[target].name,
          message: `Moved ${direction < 0 ? "up" : "down"} to place ${target + 1} of ${mods.length}.`,
          details: { order: mods.map((mod) => mod.name) },
        });
        return { ...state, mods };
      },
      "move a mod"
    );
  }

  public static async remove(shop: GameShop, objectId: string, modId: string) {
    await this.change(
      shop,
      objectId,
      (state) => {
        const mod = state.mods.find((item) => item.id === modId);
        if (mod)
          void ModActivity.append(shop, objectId, {
            kind: "removed",
            modId,
            modName: mod.name,
            message: "Removed; its staged files are deleted.",
          });
        return {
          ...state,
          mods: state.mods.filter((item) => item.id !== modId),
        };
      },
      "remove a mod"
    );
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

  /** The mod list, play mode and profile as they are, for launches and reports. */
  public static async readState(shop: GameShop, objectId: string) {
    const state = await this.readMods(storeFolder(shop, objectId));
    return {
      mods: state.mods,
      nexusGame: state.nexusGame,
      playMode: state.playMode ?? ("modded" as ModPlayMode),
      saveBackupOffered: state.saveBackupOffered ?? false,
      profileName:
        state.profiles?.find((profile) => profile.id === state.activeProfileId)
          ?.name ?? null,
      overridden: planDeployment(state.mods).overridden,
      loader: (() => {
        const loaderMod = findEnabledLoader(state.mods);
        return loaderMod
          ? {
              name: loaderMod.name,
              version: loaderMod.version,
              nativeDlls: loaderMod.loader!.nativeDlls,
            }
          : null;
      })(),
    };
  }

  /**
   * What Play (modded) adds for the game's loader: its proxy DLLs. Null for
   * Play, or when no loader is on.
   */
  public static async getLaunchLoader(shop: GameShop, objectId: string) {
    const state = await this.readState(shop, objectId).catch(() => null);
    if (!state || state.playMode !== "modded") return null;
    return state.loader;
  }

  private static updateFile(
    shop: GameShop,
    objectId: string,
    update: (state: ModsFile) => ModsFile
  ) {
    const folder = storeFolder(shop, objectId);
    return serialize(folder, async () => {
      const state = await this.readMods(folder);
      await writeJson(modsFilePath(folder), update(state));
    });
  }

  public static async setPlayMode(
    shop: GameShop,
    objectId: string,
    playMode: ModPlayMode
  ) {
    await this.updateFile(shop, objectId, (state) => ({ ...state, playMode }));
    await ModActivity.append(shop, objectId, {
      kind: "play-mode",
      message:
        playMode === "modded"
          ? "Play now starts the game modded."
          : "Play now starts the game without the loader.",
    });
  }

  public static markSaveBackupOffered(shop: GameShop, objectId: string) {
    return this.updateFile(shop, objectId, (state) => ({
      ...state,
      saveBackupOffered: true,
    }));
  }

  /** The game's folder in the mod store. */
  public static storeFolder(shop: GameShop, objectId: string) {
    return storeFolder(shop, objectId);
  }

  public static stagingRoot(shop: GameShop, objectId: string) {
    return path.join(storeFolder(shop, objectId), "staging");
  }
}
