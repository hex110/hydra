import fs from "node:fs";
import path from "node:path";
import type { WidescreenPatchManifest } from "@types";

export const WIDESCREEN_MANIFEST_FILE = ".hydra-widescreen-patch.json";
export const WIDESCREEN_BACKUP_DIRECTORY = ".hydra-widescreen-patch-backup";

const exists = (target: string) =>
  fs.promises.access(target).then(
    () => true,
    () => false
  );

const listFiles = async (root: string): Promise<string[]> => {
  const files: string[] = [];
  const walk = async (directory: string) => {
    for (const entry of await fs.promises.readdir(directory, {
      withFileTypes: true,
    })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(entryPath);
      else if (entry.isFile()) files.push(path.relative(root, entryPath));
    }
  };
  await walk(root);
  return files;
};

export const readWidescreenManifest = async (
  installDirectory: string
): Promise<WidescreenPatchManifest | null> => {
  try {
    const manifest = JSON.parse(
      await fs.promises.readFile(
        path.join(installDirectory, WIDESCREEN_MANIFEST_FILE),
        "utf8"
      )
    ) as WidescreenPatchManifest;
    return Array.isArray(manifest.files) ? manifest : null;
  } catch {
    return null;
  }
};

/** Files of a Hydra installation that are no longer on disk. */
export const findMissingWidescreenFiles = async (
  installDirectory: string,
  manifest: WidescreenPatchManifest
) => {
  const present = await Promise.all(
    manifest.files.map((file) => exists(path.join(installDirectory, file)))
  );
  return manifest.files.filter((_file, index) => !present[index]);
};

/**
 * The patch's files inside an extracted zip, keyed by where they go: what is
 * under `archiveFolder` (at any depth), relative to it. Empty when the zip
 * has no such folder.
 */
export const planWidescreenFiles = async (
  extractedDirectory: string,
  archiveFolder: string
) => {
  const marker = `${archiveFolder.toLowerCase().replaceAll("\\", "/")}/`;
  const plan: { source: string; target: string }[] = [];
  for (const file of await listFiles(extractedDirectory)) {
    const normalized = file.replaceAll("\\", "/");
    const at = `/${normalized.toLowerCase()}`.indexOf(`/${marker}`);
    if (at < 0) continue;
    plan.push({
      source: path.join(extractedDirectory, file),
      target: normalized.slice(at + marker.length),
    });
  }
  return plan;
};

/** The top-level files of the plan that the game already has and the patch did not put there. */
export const findWidescreenConflict = async (
  installDirectory: string,
  fileName: string
) => {
  const manifest = await readWidescreenManifest(installDirectory);
  if (
    manifest?.files.some(
      (file) => file.toLowerCase() === fileName.toLowerCase()
    )
  )
    return false;
  return exists(path.join(installDirectory, fileName));
};

export interface InstallWidescreenPatchOptions {
  patchId: string;
  version: string;
  installDirectory: string;
  files: { source: string; target: string }[];
}

/**
 * Copies a patch into a game. Game files that would be replaced are moved to
 * a backup folder first, and everything Hydra wrote is listed in a manifest so
 * {@link uninstallWidescreenPatch} can undo it exactly.
 */
export const installWidescreenPatch = async (
  options: InstallWidescreenPatchOptions
): Promise<WidescreenPatchManifest> => {
  const { installDirectory } = options;
  if (await readWidescreenManifest(installDirectory)) {
    await uninstallWidescreenPatch(installDirectory);
  }

  const manifest: WidescreenPatchManifest = {
    patchId: options.patchId,
    version: options.version,
    installedAt: new Date().toISOString(),
    files: [],
    directories: [],
    backups: [],
  };
  const writeManifest = () =>
    fs.promises.writeFile(
      path.join(installDirectory, WIDESCREEN_MANIFEST_FILE),
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

  // The manifest is written first so a failed install can still be undone.
  await writeManifest();
  try {
    for (const { source, target: relativeTarget } of options.files) {
      const target = path.join(installDirectory, relativeTarget);
      await ensureDirectory(path.dirname(relativeTarget));
      if (await exists(target)) {
        const backup = path.join(
          installDirectory,
          WIDESCREEN_BACKUP_DIRECTORY,
          relativeTarget
        );
        await fs.promises.mkdir(path.dirname(backup), { recursive: true });
        await fs.promises.rename(target, backup);
        manifest.backups.push(relativeTarget);
      }
      manifest.files.push(relativeTarget);
      await fs.promises.copyFile(source, target);
    }
  } catch (error) {
    await writeManifest().catch(() => undefined);
    await uninstallWidescreenPatch(installDirectory).catch(() => undefined);
    throw error;
  }

  await writeManifest();
  return manifest;
};

const removeIfEmpty = async (directory: string) => {
  const entries = await fs.promises.readdir(directory).catch(() => null);
  if (entries?.length === 0) await fs.promises.rmdir(directory);
};

/** Removes a Hydra-installed patch and restores the files it replaced. */
export const uninstallWidescreenPatch = async (
  installDirectory: string
): Promise<boolean> => {
  const manifest = await readWidescreenManifest(installDirectory);
  if (!manifest) return false;

  const resolveInside = (relativePath: string) => {
    const resolved = path.resolve(installDirectory, relativePath);
    if (!resolved.startsWith(path.resolve(installDirectory) + path.sep)) {
      throw new Error(`Refusing to touch ${relativePath} outside the game`);
    }
    return resolved;
  };

  for (const file of manifest.files) {
    await fs.promises.rm(resolveInside(file), { force: true });
  }

  const backupRoot = path.join(installDirectory, WIDESCREEN_BACKUP_DIRECTORY);
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
  await fs.promises.rm(path.join(installDirectory, WIDESCREEN_MANIFEST_FILE), {
    force: true,
  });
  return true;
};
