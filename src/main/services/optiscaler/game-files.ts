import fs from "node:fs";
import path from "node:path";
import type {
  OptiScalerChannel,
  OptiScalerManifest,
  OptiScalerProxyDll,
} from "@types";
import {
  applyIniOverrides,
  isUpscalerLibrary,
  type IniOverride,
} from "../../../shared/optiscaler.js";

export const OPTISCALER_MANIFEST_FILE = ".hydra-optiscaler.json";
export const OPTISCALER_BACKUP_DIRECTORY = ".hydra-optiscaler-backup";
export const OPTISCALER_INI_FILE = "OptiScaler.ini";
export const OPTIPATCHER_FILE = path.join("plugins", "OptiPatcher.asi");

const RELEASE_ENTRY_POINT = "OptiScaler.dll";

/** Release files that only matter for a manual install. */
const SKIPPED_RELEASE_FILE =
  /^(setup_(linux\.sh|windows\.bat)|remove_optiscaler\.sh|!!.*\.txt)$/i;

/** Files OptiScaler and its bundled tools write while the game runs. */
const RUNTIME_FILES = ["OptiScaler.log", "fakenvapi.log", "dlssg_to_fsr3.log"];

const UPSCALER_SCAN_MAX_DEPTH = 8;
const UPSCALER_SCAN_MAX_ENTRIES = 20_000;

const exists = (target: string) =>
  fs.promises.access(target).then(
    () => true,
    () => false
  );

const isUnrealBinariesDirectory = (directory: string) =>
  /[\\/]binaries[\\/]win64$/i.test(directory) &&
  !/[\\/]engine[\\/]binaries[\\/]win64$/i.test(directory);

/**
 * Where OptiScaler has to live for a game: next to the executable, or, for
 * Unreal Engine games launched through a bootstrap executable, next to the
 * `-Shipping` binary in `<Project>/Binaries/Win64`.
 */
export const resolveOptiScalerInstallDirectory = async (
  executablePath: string
): Promise<string> => {
  const executableDirectory = path.dirname(executablePath);
  if (isUnrealBinariesDirectory(executableDirectory)) {
    return executableDirectory;
  }

  const entries = await fs.promises
    .readdir(executableDirectory, { withFileTypes: true })
    .catch(() => [] as fs.Dirent[]);

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.toLowerCase() === "engine") continue;

    const binaries = path.join(
      executableDirectory,
      entry.name,
      "Binaries",
      "Win64"
    );
    const binaryNames = await fs.promises.readdir(binaries).catch(() => []);
    if (binaryNames.some((name) => /-shipping\.exe$/i.test(name))) {
      return binaries;
    }
  }

  return executableDirectory;
};

/** The folder to search for upscaler libraries: the game root for Unreal games. */
export const resolveGameRootForDetection = (installDirectory: string) =>
  isUnrealBinariesDirectory(installDirectory)
    ? path.resolve(installDirectory, "..", "..", "..")
    : installDirectory;

/** Lists upscaler libraries the game ships, ignoring files Hydra installed. */
export const findUpscalerLibraries = async (
  gameRoot: string,
  ignoredPaths: Set<string> = new Set()
): Promise<string[]> => {
  const found: string[] = [];
  let visited = 0;

  const walk = async (directory: string, depth: number) => {
    if (depth > UPSCALER_SCAN_MAX_DEPTH) return;

    const entries = await fs.promises
      .readdir(directory, { withFileTypes: true })
      .catch(() => [] as fs.Dirent[]);

    for (const entry of entries) {
      if (++visited > UPSCALER_SCAN_MAX_ENTRIES) return;

      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === OPTISCALER_BACKUP_DIRECTORY) continue;
        await walk(entryPath, depth + 1);
      } else if (
        isUpscalerLibrary(entry.name) &&
        !ignoredPaths.has(path.resolve(entryPath))
      ) {
        found.push(path.relative(gameRoot, entryPath));
      }
    }
  };

  await walk(gameRoot, 0);
  return found;
};

export const readOptiScalerManifest = async (
  installDirectory: string
): Promise<OptiScalerManifest | null> => {
  try {
    const raw = await fs.promises.readFile(
      path.join(installDirectory, OPTISCALER_MANIFEST_FILE),
      "utf8"
    );
    const manifest = JSON.parse(raw) as OptiScalerManifest;
    return Array.isArray(manifest.files) ? manifest : null;
  } catch {
    return null;
  }
};

/** Files of a Hydra installation that are no longer on disk. */
export const findMissingOptiScalerFiles = async (
  installDirectory: string,
  manifest: OptiScalerManifest
): Promise<string[]> => {
  const present = await Promise.all(
    manifest.files.map((file) => exists(path.join(installDirectory, file)))
  );
  return manifest.files.filter((_file, index) => !present[index]);
};

/** OptiScaler is present but was not installed by Hydra (OptiScaler Client, by hand). */
export const hasExternalOptiScaler = async (installDirectory: string) =>
  (await exists(path.join(installDirectory, OPTISCALER_INI_FILE))) &&
  !(await exists(path.join(installDirectory, OPTISCALER_MANIFEST_FILE)));

/** Finds the folder holding OptiScaler.dll inside an extracted release. */
export const findReleaseRoot = async (
  extractedDirectory: string
): Promise<string | null> => {
  if (await exists(path.join(extractedDirectory, RELEASE_ENTRY_POINT))) {
    return extractedDirectory;
  }

  const entries = await fs.promises
    .readdir(extractedDirectory, { withFileTypes: true })
    .catch(() => [] as fs.Dirent[]);

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(extractedDirectory, entry.name);
    if (await exists(path.join(candidate, RELEASE_ENTRY_POINT))) {
      return candidate;
    }
  }

  return null;
};

const listFiles = async (root: string): Promise<string[]> => {
  const files: string[] = [];

  const walk = async (directory: string) => {
    const entries = await fs.promises.readdir(directory, {
      withFileTypes: true,
    });
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(entryPath);
      else if (entry.isFile()) files.push(path.relative(root, entryPath));
    }
  };

  await walk(root);
  return files;
};

export interface InstallOptiScalerOptions {
  releaseDirectory: string;
  installDirectory: string;
  version: string;
  channel: OptiScalerChannel;
  proxyDll: OptiScalerProxyDll;
  iniOverrides: IniOverride[];
  optiPatcher: { path: string; version: string } | null;
}

/**
 * Copies an OptiScaler release into a game. Game files that would be
 * replaced are moved to a backup folder first, and everything Hydra wrote is
 * listed in a manifest so {@link uninstallOptiScaler} can undo it exactly.
 */
export const installOptiScaler = async (
  options: InstallOptiScalerOptions
): Promise<OptiScalerManifest> => {
  const { installDirectory } = options;

  if (await readOptiScalerManifest(installDirectory)) {
    await uninstallOptiScaler(installDirectory);
  }

  const manifest: OptiScalerManifest = {
    version: options.version,
    channel: options.channel,
    proxyDll: options.proxyDll,
    optiPatcherVersion: options.optiPatcher?.version ?? null,
    installedAt: new Date().toISOString(),
    files: [],
    directories: [],
    backups: [],
  };

  const writeManifest = () =>
    fs.promises.writeFile(
      path.join(installDirectory, OPTISCALER_MANIFEST_FILE),
      JSON.stringify(manifest, null, 2)
    );

  const ensureDirectory = async (relativeDirectory: string) => {
    const missing: string[] = [];
    let current = relativeDirectory;
    while (current && current !== ".") {
      if (await exists(path.join(installDirectory, current))) break;
      missing.push(current);
      current = path.dirname(current);
    }
    for (const directory of missing.reverse()) {
      await fs.promises.mkdir(path.join(installDirectory, directory));
      manifest.directories.unshift(directory);
    }
  };

  const placeFile = async (source: string, relativeTarget: string) => {
    const target = path.join(installDirectory, relativeTarget);
    await ensureDirectory(path.dirname(relativeTarget));

    if (await exists(target)) {
      const backup = path.join(
        installDirectory,
        OPTISCALER_BACKUP_DIRECTORY,
        relativeTarget
      );
      await fs.promises.mkdir(path.dirname(backup), { recursive: true });
      await fs.promises.rename(target, backup);
      manifest.backups.push(relativeTarget);
    }

    manifest.files.push(relativeTarget);
    await fs.promises.copyFile(source, target);
  };

  // The manifest is written first so a failed install can still be undone.
  await writeManifest();

  try {
    for (const relativePath of await listFiles(options.releaseDirectory)) {
      if (SKIPPED_RELEASE_FILE.test(path.basename(relativePath))) continue;

      await placeFile(
        path.join(options.releaseDirectory, relativePath),
        relativePath === RELEASE_ENTRY_POINT ? options.proxyDll : relativePath
      );
    }

    const iniOverrides = [...options.iniOverrides];
    if (options.optiPatcher) {
      await placeFile(options.optiPatcher.path, OPTIPATCHER_FILE);
      iniOverrides.unshift({
        section: "Plugins",
        key: "LoadAsiPlugins",
        value: "true",
      });
    }

    const iniPath = path.join(installDirectory, OPTISCALER_INI_FILE);
    if (iniOverrides.length > 0 && (await exists(iniPath))) {
      const ini = await fs.promises.readFile(iniPath, "utf8");
      await fs.promises.writeFile(
        iniPath,
        applyIniOverrides(ini, iniOverrides)
      );
    }
  } catch (error) {
    await writeManifest().catch(() => undefined);
    await uninstallOptiScaler(installDirectory).catch(() => undefined);
    throw error;
  }

  await writeManifest();
  return manifest;
};

const removeIfEmpty = async (directory: string) => {
  const entries = await fs.promises.readdir(directory).catch(() => null);
  if (entries?.length === 0) await fs.promises.rmdir(directory);
};

/** Removes a Hydra-installed OptiScaler and restores the files it replaced. */
export const uninstallOptiScaler = async (
  installDirectory: string
): Promise<boolean> => {
  const manifest = await readOptiScalerManifest(installDirectory);
  if (!manifest) return false;

  const resolveInside = (relativePath: string) => {
    const resolved = path.resolve(installDirectory, relativePath);
    if (!resolved.startsWith(path.resolve(installDirectory) + path.sep)) {
      throw new Error(`Refusing to touch ${relativePath} outside the game`);
    }
    return resolved;
  };

  for (const file of [...manifest.files, ...RUNTIME_FILES]) {
    await fs.promises.rm(resolveInside(file), { force: true });
  }

  const backupRoot = path.join(installDirectory, OPTISCALER_BACKUP_DIRECTORY);
  for (const file of manifest.backups) {
    const backup = path.join(backupRoot, file);
    if (!(await exists(backup))) continue;
    await fs.promises.mkdir(path.dirname(resolveInside(file)), {
      recursive: true,
    });
    await fs.promises.rename(backup, resolveInside(file));
  }

  for (const directory of manifest.directories) {
    await removeIfEmpty(resolveInside(directory));
  }

  await fs.promises.rm(backupRoot, { recursive: true, force: true });
  await fs.promises.rm(path.join(installDirectory, OPTISCALER_MANIFEST_FILE), {
    force: true,
  });

  return true;
};
