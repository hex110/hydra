import fs from "node:fs";
import path from "node:path";
import type { FileFingerprint, Game } from "@types";
import {
  RENODX_BACKUP_DIRECTORY,
  RENODX_MANIFEST_FILE,
} from "../../../shared/renodx.js";
import {
  fingerprintFiles,
  findReplacedToolFiles,
} from "../file-fingerprint.js";
import {
  OPTISCALER_BACKUP_DIRECTORY,
  OPTISCALER_MANIFEST_FILE,
} from "../optiscaler/game-files.js";
import {
  WIDESCREEN_BACKUP_DIRECTORY,
  WIDESCREEN_MANIFEST_FILE,
} from "../widescreen-patch/game-files.js";

/**
 * Tools that put files over a game's own (OptiScaler, ReShade for RenoDX, the
 * widescreen patch). They share one record: a manifest of the files they
 * placed and the game files they moved to a backup folder. A game update must
 * not overwrite their files, and their backups must not go stale, so the
 * update takes them out first and lays them back over the new files.
 */
export type ToolOverlayId = "optiscaler" | "renodx" | "widescreen-patch";

interface ToolOverlay {
  manifestFile: string;
  backupDirectory: string;
  /**
   * Made for one version of the game: when the update ships a file the tool
   * replaced, the tool is left out instead of being laid over it.
   */
  versionSpecific: boolean;
}

const TOOL_OVERLAYS: Record<ToolOverlayId, ToolOverlay> = {
  optiscaler: {
    manifestFile: OPTISCALER_MANIFEST_FILE,
    backupDirectory: OPTISCALER_BACKUP_DIRECTORY,
    versionSpecific: false,
  },
  renodx: {
    manifestFile: RENODX_MANIFEST_FILE,
    backupDirectory: RENODX_BACKUP_DIRECTORY,
    versionSpecific: false,
  },
  "widescreen-patch": {
    manifestFile: WIDESCREEN_MANIFEST_FILE,
    backupDirectory: WIDESCREEN_BACKUP_DIRECTORY,
    versionSpecific: true,
  },
};

const STASH_DIRECTORY = ".hydra-update-stash";

export interface ToolOverlayLocation {
  tool: ToolOverlayId;
  directory: string;
}

interface OverlayManifest {
  files: string[];
  directories: string[];
  backups: string[];
  fingerprints?: Record<string, FileFingerprint>;
}

const exists = (target: string) =>
  fs.promises.access(target).then(
    () => true,
    () => false
  );

const isInside = (parent: string, child: string) => {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
};

/** The tools installed in (or around) the folder an update goes into. */
export const toolOverlaysForGame = (
  game: Pick<Game, "optiScaler" | "renoDx" | "widescreenPatch">,
  installDirectory: string
): ToolOverlayLocation[] =>
  (
    [
      ["optiscaler", game.optiScaler?.directory],
      ["renodx", game.renoDx?.directory],
      ["widescreen-patch", game.widescreenPatch?.directory],
    ] as [ToolOverlayId, string | undefined][]
  )
    .filter(
      ([, directory]) =>
        !!directory &&
        (isInside(installDirectory, directory) ||
          isInside(directory, installDirectory))
    )
    .map(([tool, directory]) => ({ tool, directory: directory! }));

const readManifest = async (
  location: ToolOverlayLocation
): Promise<OverlayManifest | null> => {
  try {
    const manifest = JSON.parse(
      await fs.promises.readFile(
        path.join(
          location.directory,
          TOOL_OVERLAYS[location.tool].manifestFile
        ),
        "utf8"
      )
    ) as OverlayManifest;
    return Array.isArray(manifest.files) && Array.isArray(manifest.backups)
      ? manifest
      : null;
  } catch {
    return null;
  }
};

const writeManifest = async (
  location: ToolOverlayLocation,
  manifest: OverlayManifest
) => {
  await fs.promises.writeFile(
    path.join(location.directory, TOOL_OVERLAYS[location.tool].manifestFile),
    JSON.stringify(manifest, null, 2)
  );
};

const moveFile = async (source: string, target: string) => {
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  try {
    await fs.promises.rename(source, target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
    await fs.promises.copyFile(source, target);
    await fs.promises.unlink(source);
  }
};

/**
 * The game's own file for each path a tool replaced (absolute path → its
 * backup), so an update is compared with what the game shipped.
 */
export const readToolOriginals = async (
  locations: ToolOverlayLocation[]
): Promise<Map<string, string>> => {
  const originals = new Map<string, string>();
  for (const location of locations) {
    const manifest = await readManifest(location);
    if (!manifest) continue;
    const replaced = await findReplacedToolFiles(location.directory, manifest);
    for (const file of manifest.backups) {
      if (replaced.has(file)) continue;
      const backup = path.join(
        location.directory,
        TOOL_OVERLAYS[location.tool].backupDirectory,
        file
      );
      if (await exists(backup))
        originals.set(path.resolve(location.directory, file), backup);
    }
  }
  return originals;
};

export interface LiftedToolOverlay {
  location: ToolOverlayLocation;
  manifest: OverlayManifest;
  /** Files the tool replaced that the game had already replaced again. */
  replaced: string[];
}

/**
 * Takes each tool's files out into a stash beside them and puts the game's
 * own files back, so the update replaces the game's files and not the tools'.
 * A file something else replaced since the tool was installed is the game's
 * now: it stays, and its stale backup is dropped.
 */
export const liftToolOverlays = async (
  locations: ToolOverlayLocation[]
): Promise<LiftedToolOverlay[]> => {
  const lifted: LiftedToolOverlay[] = [];
  for (const location of locations) {
    const manifest = await readManifest(location);
    if (!manifest) continue;
    const { backupDirectory } = TOOL_OVERLAYS[location.tool];
    const stash = path.join(location.directory, STASH_DIRECTORY, location.tool);
    const replaced = await findReplacedToolFiles(location.directory, manifest);

    for (const file of manifest.files) {
      if (replaced.has(file)) continue;
      const target = path.join(location.directory, file);
      if (await exists(target)) await moveFile(target, path.join(stash, file));
    }
    for (const file of manifest.backups) {
      const backup = path.join(location.directory, backupDirectory, file);
      if (!(await exists(backup))) continue;
      if (replaced.has(file)) await fs.promises.rm(backup, { force: true });
      else await moveFile(backup, path.join(location.directory, file));
    }

    lifted.push({
      location,
      manifest: {
        ...manifest,
        files: manifest.files.filter((file) => !replaced.has(file)),
        backups: manifest.backups.filter((file) => !replaced.has(file)),
      },
      replaced: [...replaced],
    });
  }
  return lifted;
};

export interface ToolOverlayOutcome {
  /** Laid back over the updated game. */
  restored: ToolOverlayId[];
  /** Left out: made for the older version, and the update replaced its files. */
  removed: ToolOverlayId[];
}

/**
 * Lays lifted tools back over the updated game. `updatedFiles` are the
 * absolute paths the update wrote. A version-specific tool (the widescreen
 * patch) whose replaced files the update shipped is removed instead.
 */
export const restoreToolOverlays = async (
  lifted: LiftedToolOverlay[],
  updatedFiles: string[]
): Promise<ToolOverlayOutcome> => {
  const updated = new Set(updatedFiles.map((file) => path.resolve(file)));
  const outcome: ToolOverlayOutcome = { restored: [], removed: [] };

  for (const { location, manifest, replaced } of lifted) {
    const tool = TOOL_OVERLAYS[location.tool];
    const stashRoot = path.join(location.directory, STASH_DIRECTORY);
    const stash = path.join(stashRoot, location.tool);
    const outdated =
      tool.versionSpecific &&
      (replaced.length > 0 ||
        manifest.backups.some((file) =>
          updated.has(path.resolve(location.directory, file))
        ));

    if (outdated) {
      await fs.promises.rm(stash, { recursive: true, force: true });
      for (const directory of manifest.directories) {
        await fs.promises
          .rmdir(path.join(location.directory, directory))
          .catch(() => undefined);
      }
      await fs.promises.rm(
        path.join(location.directory, tool.backupDirectory),
        {
          recursive: true,
          force: true,
        }
      );
      await fs.promises.rm(path.join(location.directory, tool.manifestFile), {
        force: true,
      });
      outcome.removed.push(location.tool);
    } else {
      const backups = new Set(manifest.backups);
      for (const file of manifest.files) {
        const stashed = path.join(stash, file);
        if (!(await exists(stashed))) continue;
        const target = path.join(location.directory, file);
        if (await exists(target)) {
          // The game's file at this path, possibly the updated one.
          await moveFile(
            target,
            path.join(location.directory, tool.backupDirectory, file)
          );
          backups.add(file);
        }
        await moveFile(stashed, target);
      }
      const nextBackups = manifest.files.filter((file) => backups.has(file));
      await writeManifest(location, {
        ...manifest,
        backups: nextBackups,
        fingerprints: await fingerprintFiles(location.directory, nextBackups),
      });
      outcome.restored.push(location.tool);
    }

    await fs.promises.rm(stash, { recursive: true, force: true });
    await fs.promises.rmdir(stashRoot).catch(() => undefined);
  }
  return outcome;
};
