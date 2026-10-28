import { mapWithConcurrency } from "../map-with-concurrency.js";
import type { SaveStoreCleanupResult, SaveStoreUsage } from "@types";

import type { SaveStoreBackend } from "./backends";
import { parseVersionFileName, ROOT } from "./layout.js";

const DAY_MS = 24 * 60 * 60_000;
const DELETE_CONCURRENCY = 4;

export interface CleanupOptions {
  /** Versions kept per game, newest first; 0 keeps every version. */
  keepVersions: number;
  /**
   * Files newer than this are never deleted: a device that has uploaded its
   * files but not yet written the version that uses them must not lose them.
   */
  blobGraceMs?: number;
  now?: number;
}

interface FileToDelete {
  path: string;
  sizeBytes: number;
}

interface CleanupPlan {
  usage: SaveStoreUsage;
  versionsToDelete: FileToDelete[];
  blobsToDelete: FileToDelete[];
}

interface VersionManifest {
  files?: { hash: string; sizeBytes: number }[];
}

const planCleanup = async (
  backend: SaveStoreBackend,
  { keepVersions, blobGraceMs = DAY_MS, now = Date.now() }: CleanupOptions
): Promise<CleanupPlan> => {
  const gameFiles = await backend.list(`${ROOT}/games`, { recursive: true });

  const games = new Map<
    string,
    Map<number, { path: string; sizeBytes: number }[]>
  >();
  let versionCount = 0;
  let versionBytes = 0;
  for (const entry of gameFiles) {
    const [shop, id, folder, name] = entry.path.split("/");
    const parsed = folder === "versions" && name && parseVersionFileName(name);
    if (!parsed) continue;
    const game = games.get(`${shop}/${id}`) ?? new Map();
    game.set(parsed.version, [
      ...(game.get(parsed.version) ?? []),
      { path: `${ROOT}/games/${entry.path}`, sizeBytes: entry.sizeBytes },
    ]);
    games.set(`${shop}/${id}`, game);
    versionCount += 1;
    versionBytes += entry.sizeBytes;
  }

  const keptPaths: string[] = [];
  const versionsToDelete: FileToDelete[] = [];
  for (const versions of games.values()) {
    const numbers = [...versions.keys()].sort((a, b) => b - a);
    const keep = keepVersions > 0 ? numbers.slice(0, keepVersions) : numbers;
    for (const number of numbers) {
      const files = versions.get(number)!;
      if (keep.includes(number)) keptPaths.push(...files.map((f) => f.path));
      else versionsToDelete.push(...files);
    }
  }

  // Deleting blobs on a guess is the one way to lose saves, so any manifest
  // that cannot be read stops the whole cleanup.
  const manifests = await backend.readTexts(keptPaths);
  const referenced = new Set<string>();
  for (const path of keptPaths) {
    const text = manifests.get(path);
    if (text === undefined) throw new Error("save-store-manifest-unreadable");
    const manifest = JSON.parse(text) as VersionManifest;
    if (!Array.isArray(manifest.files)) {
      throw new Error("save-store-manifest-unreadable");
    }
    for (const file of manifest.files) {
      referenced.add(`${file.hash}-${file.sizeBytes}`);
    }
  }

  const blobFiles = await backend.list(`${ROOT}/blobs`, { recursive: true });
  const blobsToDelete: FileToDelete[] = [];
  let blobBytes = 0;
  for (const blob of blobFiles) {
    blobBytes += blob.sizeBytes;
    const name = blob.path.split("/").pop() ?? "";
    if (referenced.has(name) || now - blob.modifiedAt < blobGraceMs) continue;
    blobsToDelete.push({
      path: `${ROOT}/blobs/${blob.path}`,
      sizeBytes: blob.sizeBytes,
    });
  }

  const sum = (files: FileToDelete[]) =>
    files.reduce((total, file) => total + file.sizeBytes, 0);

  return {
    usage: {
      games: games.size,
      versions: versionCount,
      blobs: blobFiles.length,
      totalBytes: blobBytes + versionBytes,
      reclaimableBytes: sum(versionsToDelete) + sum(blobsToDelete),
      reclaimableVersions: versionsToDelete.length,
      reclaimableBlobs: blobsToDelete.length,
    },
    versionsToDelete,
    blobsToDelete,
  };
};

export const scanSaveStore = async (
  backend: SaveStoreBackend,
  options: CleanupOptions
): Promise<SaveStoreUsage> => (await planCleanup(backend, options)).usage;

/**
 * Deletes versions beyond the newest `keepVersions` of each game, then the
 * files no kept version uses. The newest version is always kept.
 */
export const cleanUpSaveStore = async (
  backend: SaveStoreBackend,
  options: CleanupOptions
): Promise<SaveStoreCleanupResult> => {
  const plan = await planCleanup(backend, options);

  // Versions first: a failure midway leaves unused files, never a version
  // pointing at deleted ones.
  await mapWithConcurrency(plan.versionsToDelete, DELETE_CONCURRENCY, (file) =>
    backend.removeFile(file.path)
  );
  await mapWithConcurrency(plan.blobsToDelete, DELETE_CONCURRENCY, (file) =>
    backend.removeFile(file.path)
  );

  return {
    removedVersions: plan.versionsToDelete.length,
    removedBlobs: plan.blobsToDelete.length,
    freedBytes: plan.usage.reclaimableBytes,
  };
};
