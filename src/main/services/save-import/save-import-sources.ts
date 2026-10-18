import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { NativeAddon } from "@main/services/native-addon";
import { SystemPath } from "@main/services/system-path";
import { Wine } from "@main/services/wine";
import { findAchievementFiles } from "@main/services/achievements/find-achievement-files";
import type {
  AchievementFile,
  Game,
  RestoreManifestFile,
  SaveImportSourceInfo,
  SnapshotVariant,
  UserPreferences,
} from "@types";
import { cloudSaveFileKey } from "../cloud-save/cloud-save-contract";
import {
  buildWindowsInstallMirror,
  getWindowsInstallCandidates,
  readWindowsInstall,
  type WindowsInstall,
} from "./windows-install";
import {
  findHydraLauncherDataPath,
  getHydraLauncherPrefix,
  readHydraLauncherLibrary,
  type HydraLauncherLibrary,
} from "./hydra-launcher";

/** A game's saves at a source, in Hydra Cloud's snapshot shape. */
export interface SourceSnapshot {
  variants: SnapshotVariant[];
  files: RestoreManifestFile[];
}

export interface SourceAchievementFile extends AchievementFile {
  /** Where the file belongs, relative to a Wine prefix. */
  prefixRelativePath: string;
}

/**
 * Somewhere saves and achievements can be imported from. Upstream Hydra and
 * Windows installs read files from disk; a cloud source would list a remote snapshot and
 * download its files, behind the same three operations.
 */
export interface SaveImportSource {
  info: SaveImportSourceInfo;
  discoverSaves(game: Game): Promise<SourceSnapshot>;
  findAchievementFiles(game: Game): Promise<SourceAchievementFile[]>;
  /** Puts a discovered file's contents in a local file and returns its path. */
  stageFile(file: RestoreManifestFile, tempDirectory: string): Promise<string>;
}

const STEAM_USERDATA_RAW_PATH = "<root>/userdata/";

const linuxUsername = () => os.userInfo().username;

/** Built once per source and run; sources are re-created for every request. */
const mirrors = new Map<string, Promise<string>>();
const hydraLauncherLibraries = new Map<string, Promise<HydraLauncherLibrary>>();

const cached = <T>(
  cache: Map<string, Promise<T>>,
  key: string,
  build: () => Promise<T>
) => {
  let value = cache.get(key);
  if (!value) {
    value = build();
    value.catch(() => cache.delete(key));
    cache.set(key, value);
  }
  return value;
};

const workDirectory = (kind: string, sourceId: string) =>
  path.join(
    SystemPath.getPath("userData"),
    "save-import",
    kind,
    createHash("sha256").update(sourceId).digest("hex").slice(0, 16)
  );

/**
 * A source that reads a game's saves from something shaped like a Wine
 * prefix, which Hydra's save discovery and achievement lookup understand.
 */
abstract class PrefixSource implements SaveImportSource {
  private readonly absolutePaths = new Map<string, string>();

  constructor(public readonly info: SaveImportSourceInfo) {}

  /** The prefix holding the game's saves, or null when there is none. */
  protected abstract getPrefix(game: Game): Promise<string | null>;

  protected getSteamPath(): string | undefined {
    return undefined;
  }

  public async discoverSaves(game: Game): Promise<SourceSnapshot> {
    const prefix = await this.getPrefix(game);
    if (!prefix) return { variants: [], files: [] };

    const result = await NativeAddon.buildLocalGameSnapshotPipeline({
      shop: game.shop,
      objectId: game.objectId,
      platform: "linux",
      homeDir: SystemPath.getPath("home"),
      // Windows compatibility is decided by an .exe; the path itself is unused.
      executablePath: path.join(prefix, "drive_c", "game", "game.exe"),
      winePrefixPath: prefix,
      steamPath: this.getSteamPath(),
      storeUserContext: { known: [] },
      title: game.title,
      remoteId: game.remoteId ?? undefined,
      userDataPath: SystemPath.getPath("userData"),
      environmentId: `save-import:${this.info.id}`,
      hashCache: [],
      extraRules: [],
    });

    for (const file of result.sourceFiles) {
      this.absolutePaths.set(cloudSaveFileKey(file), file.absolutePath);
    }

    // Steam's userdata folder is Steam's own: Steam Cloud syncs it, and
    // games run from a Wine prefix never read it.
    const files = result.files.filter(
      (file) => !file.rawPath.startsWith(STEAM_USERDATA_RAW_PATH)
    );
    return { variants: result.variants, files };
  }

  public async findAchievementFiles(
    game: Game
  ): Promise<SourceAchievementFile[]> {
    const prefix = await this.getPrefix(game);
    if (!prefix) return [];
    return findAchievementFiles({ ...game, winePrefixPath: prefix }).map(
      (file) => ({
        ...file,
        prefixRelativePath: path.relative(prefix, file.filePath),
      })
    );
  }

  public async stageFile(file: RestoreManifestFile, tempDirectory: string) {
    const source = this.absolutePaths.get(cloudSaveFileKey(file));
    if (!source) throw new Error("File was not discovered at this source");

    const target = path.join(tempDirectory, `${file.hash}-${file.sizeBytes}`);
    await fs.promises.copyFile(source, target);
    const modified = new Date(file.lastModifiedAt);
    await fs.promises.utimes(target, modified, modified);
    return target;
  }
}

class WindowsInstallSource extends PrefixSource {
  constructor(
    info: SaveImportSourceInfo,
    private readonly install: WindowsInstall
  ) {
    super(info);
  }

  protected getPrefix() {
    return cached(mirrors, this.info.id, () =>
      buildWindowsInstallMirror(
        this.install,
        this.info.userProfile,
        linuxUsername(),
        workDirectory("mirrors", this.info.id)
      )
    );
  }

  protected getSteamPath() {
    return this.install.steamPath ?? undefined;
  }
}

/** Upstream Hydra on the same machine: the prefixes it ran games in. */
class HydraLauncherSource extends PrefixSource {
  protected async getPrefix(game: Game) {
    const library = await cached(hydraLauncherLibraries, this.info.id, () =>
      readHydraLauncherLibrary(
        this.info.rootPath,
        workDirectory("hydra-launcher-db", this.info.id)
      )
    );
    const prefix = getHydraLauncherPrefix(library, game);
    const own = Wine.getEffectivePrefixPath(game.winePrefixPath, game.objectId);
    if (own && path.resolve(own) === path.resolve(prefix)) return null;
    return fs.existsSync(path.join(prefix, "drive_c")) ? prefix : null;
  }
}

const windowsSourceId = (rootPath: string, userProfile: string) =>
  `windows:${rootPath}:${userProfile}`;

/**
 * Every source: upstream Hydra, detected Windows installs, then ones the
 * user added.
 */
export const listSaveImportSources = (
  preferences: UserPreferences | null
): SaveImportSource[] => {
  const disabled = new Set(preferences?.saveImportDisabledSources ?? []);
  const sources = new Map<string, SaveImportSource>();

  const hydraDataPath = findHydraLauncherDataPath(
    SystemPath.getPath("appData")
  );
  if (
    hydraDataPath &&
    path.resolve(hydraDataPath) !== path.resolve(SystemPath.getPath("userData"))
  ) {
    const id = `hydra-launcher:${hydraDataPath}`;
    sources.set(
      id,
      new HydraLauncherSource({
        id,
        kind: "hydra-launcher",
        label: `Hydra Launcher (${hydraDataPath})`,
        rootPath: hydraDataPath,
        userProfile: "",
        detected: true,
        enabled: !disabled.has(id),
      })
    );
  }

  const addInstall = (
    install: WindowsInstall,
    userProfiles: string[],
    detected: boolean
  ) => {
    for (const userProfile of userProfiles) {
      const id = windowsSourceId(install.rootPath, userProfile);
      if (sources.has(id)) continue;
      sources.set(
        id,
        new WindowsInstallSource(
          {
            id,
            kind: "windows-install",
            label: `Windows on ${install.rootPath} (${userProfile})`,
            rootPath: install.rootPath,
            userProfile,
            detected,
            enabled: !disabled.has(id),
          },
          install
        )
      );
    }
  };

  for (const candidate of getWindowsInstallCandidates(linuxUsername())) {
    const install = readWindowsInstall(candidate);
    if (install) addInstall(install, install.userProfiles, true);
  }

  for (const custom of preferences?.saveImportCustomSources ?? []) {
    const install = readWindowsInstall(custom.rootPath);
    if (install?.userProfiles.includes(custom.userProfile)) {
      addInstall(install, [custom.userProfile], false);
    }
  }

  return [...sources.values()];
};
