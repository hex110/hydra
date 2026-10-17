import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { NativeAddon } from "@main/services/native-addon";
import { SystemPath } from "@main/services/system-path";
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
 * Somewhere saves and achievements can be imported from. Windows installs
 * read files from a drive; a cloud source would list a remote snapshot and
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

const mirrorsDirectory = () =>
  path.join(SystemPath.getPath("userData"), "save-import", "mirrors");

/** Built once per source and run; sources are re-created for every request. */
const mirrors = new Map<string, Promise<string>>();

class WindowsInstallSource implements SaveImportSource {
  private readonly absolutePaths = new Map<string, string>();

  constructor(
    public readonly info: SaveImportSourceInfo,
    private readonly install: WindowsInstall
  ) {}

  private getMirror() {
    let mirror = mirrors.get(this.info.id);
    if (!mirror) {
      mirror = buildWindowsInstallMirror(
        this.install,
        this.info.userProfile,
        linuxUsername(),
        path.join(
          mirrorsDirectory(),
          createHash("sha256").update(this.info.id).digest("hex").slice(0, 16)
        )
      );
      mirror.catch(() => mirrors.delete(this.info.id));
      mirrors.set(this.info.id, mirror);
    }
    return mirror;
  }

  public async discoverSaves(game: Game): Promise<SourceSnapshot> {
    const mirror = await this.getMirror();
    const result = await NativeAddon.buildLocalGameSnapshotPipeline({
      shop: game.shop,
      objectId: game.objectId,
      platform: "linux",
      homeDir: SystemPath.getPath("home"),
      // Windows compatibility is decided by an .exe; the path itself is unused.
      executablePath: path.join(mirror, "drive_c", "game", "game.exe"),
      winePrefixPath: mirror,
      steamPath: this.install.steamPath ?? undefined,
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
    const mirror = await this.getMirror();
    return findAchievementFiles({ ...game, winePrefixPath: mirror }).map(
      (file) => ({
        ...file,
        prefixRelativePath: path.relative(mirror, file.filePath),
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

const windowsSourceId = (rootPath: string, userProfile: string) =>
  `windows:${rootPath}:${userProfile}`;

/** Every source: detected Windows installs, then ones the user added. */
export const listSaveImportSources = (
  preferences: UserPreferences | null
): SaveImportSource[] => {
  const disabled = new Set(preferences?.saveImportDisabledSources ?? []);
  const sources = new Map<string, SaveImportSource>();

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
