import fs from "node:fs";
import path from "node:path";
import type {
  ReShadeProxyDll,
  RenoDxArchitecture,
  RenoDxManifest,
} from "@types";
import {
  applyIniOverrides,
  type IniOverride,
} from "../../../shared/ini-overrides.js";
import {
  RENODX_BACKUP_DIRECTORY,
  RENODX_MANIFEST_FILE,
} from "../../../shared/renodx.js";
import { RESHADE_INI_FILE, buildReShadeIni } from "../../../shared/reshade.js";

export const OPTISCALER_INI_FILE = "OptiScaler.ini";

const exists = (target: string) =>
  fs.promises.access(target).then(
    () => true,
    () => false
  );

/** The name ReShade's DLL has when OptiScaler loads it instead of Wine. */
export const reShadeFileForLoader = (architecture: RenoDxArchitecture) =>
  architecture === "x86" ? "ReShade32.dll" : "ReShade64.dll";

export const readRenoDxManifest = async (
  installDirectory: string
): Promise<RenoDxManifest | null> => {
  try {
    const raw = await fs.promises.readFile(
      path.join(installDirectory, RENODX_MANIFEST_FILE),
      "utf8"
    );
    const manifest = JSON.parse(raw) as RenoDxManifest;
    return Array.isArray(manifest.files) ? manifest : null;
  } catch {
    return null;
  }
};

/** Files of a Hydra installation that are no longer on disk. */
export const findMissingRenoDxFiles = async (
  installDirectory: string,
  manifest: RenoDxManifest
): Promise<string[]> => {
  const present = await Promise.all(
    manifest.files.map((file) => exists(path.join(installDirectory, file)))
  );
  return manifest.files.filter((_file, index) => !present[index]);
};

/** Add-ons or ReShade settings are in the folder but Hydra did not put them there. */
export const hasExternalRenoDx = async (installDirectory: string) => {
  if (await exists(path.join(installDirectory, RENODX_MANIFEST_FILE))) {
    return false;
  }
  const names = await fs.promises
    .readdir(installDirectory)
    .catch(() => [] as string[]);
  return names.some((name) => /^renodx-.+\.addon(64|32)$/i.test(name));
};

export interface InstallRenoDxOptions {
  installDirectory: string;
  /** Folder holding ReShade64.dll and ReShade32.dll. */
  reShadeDirectory: string;
  reShadeVersion: string;
  architecture: RenoDxArchitecture;
  /** The name ReShade loads as, or null when OptiScaler loads it. */
  proxyDll: ReShadeProxyDll | null;
  addon: { file: string; name: string; version: string };
  modId: string;
  iniOverrides: IniOverride[];
}

/**
 * Copies ReShade and a RenoDX add-on into a game. Game files that would be
 * replaced are moved to a backup folder first, and everything Hydra wrote is
 * listed in a manifest so {@link uninstallRenoDx} can undo it exactly.
 */
export const installRenoDx = async (
  options: InstallRenoDxOptions
): Promise<RenoDxManifest> => {
  const { installDirectory } = options;

  if (await readRenoDxManifest(installDirectory)) {
    await uninstallRenoDx(installDirectory);
  }

  const loadedByOptiScaler = options.proxyDll === null;
  const reShadeFile =
    options.proxyDll ?? reShadeFileForLoader(options.architecture);

  const manifest: RenoDxManifest = {
    reShadeVersion: options.reShadeVersion,
    reShadeFile,
    loadedByOptiScaler,
    modId: options.modId,
    addonFile: options.addon.name,
    addonVersion: options.addon.version,
    installedAt: new Date().toISOString(),
    files: [],
    directories: [],
    backups: [],
  };

  const writeManifest = () =>
    fs.promises.writeFile(
      path.join(installDirectory, RENODX_MANIFEST_FILE),
      JSON.stringify(manifest, null, 2)
    );

  const placeFile = async (source: string, relativeTarget: string) => {
    const target = path.join(installDirectory, relativeTarget);

    if (await exists(target)) {
      const backup = path.join(
        installDirectory,
        RENODX_BACKUP_DIRECTORY,
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
    await placeFile(
      path.join(
        options.reShadeDirectory,
        options.architecture === "x86" ? "ReShade32.dll" : "ReShade64.dll"
      ),
      reShadeFile
    );
    await placeFile(options.addon.file, options.addon.name);

    // An existing ReShade.ini is the user's: change it in place and leave it
    // when RenoDX is removed. A new one is Hydra's and goes with the rest.
    const iniPath = path.join(installDirectory, RESHADE_INI_FILE);
    const existingIni = await fs.promises
      .readFile(iniPath, "utf8")
      .catch(() => null);
    await fs.promises.writeFile(
      iniPath,
      buildReShadeIni(existingIni, options.iniOverrides)
    );
    if (existingIni === null) manifest.files.push(RESHADE_INI_FILE);

    if (loadedByOptiScaler) {
      await enableOptiScalerReShade(installDirectory);
    }
  } catch (error) {
    await writeManifest().catch(() => undefined);
    await uninstallRenoDx(installDirectory).catch(() => undefined);
    throw error;
  }

  await writeManifest();
  return manifest;
};

/** Tells OptiScaler to load the ReShade DLL beside it. Does nothing without OptiScaler.ini. */
const enableOptiScalerReShade = async (installDirectory: string) => {
  const iniPath = path.join(installDirectory, OPTISCALER_INI_FILE);
  const ini = await fs.promises.readFile(iniPath, "utf8").catch(() => null);
  if (ini === null) return;
  await fs.promises.writeFile(
    iniPath,
    applyIniOverrides(ini, [
      { section: "Plugins", key: "LoadReshade", value: "true" },
    ])
  );
};

/**
 * Removes what {@link installRenoDx} wrote and restores the game files it
 * moved to the backup folder. Files that are already gone are skipped.
 */
export const uninstallRenoDx = async (installDirectory: string) => {
  const manifest = await readRenoDxManifest(installDirectory);
  if (!manifest) return;

  for (const file of manifest.files) {
    await fs.promises.rm(path.join(installDirectory, file), { force: true });
  }

  const backupRoot = path.join(installDirectory, RENODX_BACKUP_DIRECTORY);
  for (const file of manifest.backups) {
    const backup = path.join(backupRoot, file);
    if (await exists(backup)) {
      await fs.promises.rename(backup, path.join(installDirectory, file));
    }
  }
  await fs.promises.rm(backupRoot, { recursive: true, force: true });

  for (const directory of manifest.directories) {
    // Only empty directories: the game may have put its own files in one since.
    await fs.promises
      .rmdir(path.join(installDirectory, directory))
      .catch(() => undefined);
  }

  await fs.promises.rm(path.join(installDirectory, RENODX_MANIFEST_FILE), {
    force: true,
  });
};
