import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import type { ArchiveEntry } from "./archive-entry";

const HASH_CHUNK_BYTES = 4 * 1024 * 1024;
const HASH_CONCURRENCY = 4;
const MAX_ROOT_DEPTH = 3;

export interface DeltaPlan {
  /** Entries whose file is missing or different, so they must be extracted. */
  changed: ArchiveEntry[];
  changedBytes: number;
  unchangedCount: number;
  unchangedBytes: number;
}

const splitEntryName = (name: string) =>
  name.split(/[\\/]+/).filter((segment) => segment.length > 0);

const isSafeSegments = (segments: string[]) =>
  segments.length > 0 &&
  segments.every((segment) => segment !== ".." && segment !== ".");

export const crc32OfFile = async (filePath: string): Promise<number> => {
  const handle = await fs.promises.open(filePath, "r");
  try {
    const buffer = Buffer.allocUnsafe(HASH_CHUNK_BYTES);
    let crc = 0;
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) return crc;
      crc = zlib.crc32(buffer.subarray(0, bytesRead), crc);
    }
  } finally {
    await handle.close();
  }
};

/**
 * The folder inside an archive that lines up with an installed game: the
 * prefix under which the game's executable sits at the same relative path.
 * Releases often wrap the game in an extra folder, so a few levels are
 * searched, shallowest first. `""` means the archive's top level.
 */
export const findArchiveRoot = (
  entries: readonly ArchiveEntry[],
  relativeExecutable: readonly string[]
): string | null => {
  if (relativeExecutable.length === 0) return null;
  const wanted = relativeExecutable.map((segment) => segment.toLowerCase());

  let best: string[] | null = null;
  for (const entry of entries) {
    const segments = splitEntryName(entry.name);
    const depth = segments.length - wanted.length;
    if (depth < 0 || depth > MAX_ROOT_DEPTH) continue;
    const tail = segments.slice(depth).map((segment) => segment.toLowerCase());
    if (tail.some((segment, index) => segment !== wanted[index])) continue;
    if (!best || depth < best.length) best = segments.slice(0, depth);
  }

  return best ? best.join("/") : null;
};

/** Whether the archive stores what is needed to compare it with files on disk. */
export const canPlanDelta = (entries: readonly ArchiveEntry[]) =>
  entries.length > 0 &&
  entries.every(
    (entry) => !entry.encrypted && (entry.size === 0 || entry.crc !== undefined)
  );

const underRoot = (segments: string[], rootSegments: string[]) =>
  rootSegments.every(
    (segment, index) => segments[index]?.toLowerCase() === segment.toLowerCase()
  );

/**
 * Compares an archive's files with the folder they would be extracted into.
 * A file with the size and CRC-32 the archive records is already what the
 * archive holds, so extracting it would change nothing; only the others
 * (new or different) need to be extracted and need room on disk. Files in the
 * folder that the archive does not have are not looked at.
 *
 * With `root`, only entries under that archive folder count, and they are
 * compared with `destination` as if the folder were extracted into it.
 */
export const planDeltaExtraction = async (
  entries: readonly ArchiveEntry[],
  destination: string,
  {
    root = "",
    onProgress,
    originals,
  }: {
    root?: string;
    onProgress?: (fraction: number) => void;
    /**
     * Files to compare instead of the one at a path (absolute path → file):
     * the game's own copy of a file a tool replaced.
     */
    originals?: ReadonlyMap<string, string>;
  } = {}
): Promise<DeltaPlan> => {
  const rootSegments = splitEntryName(root);
  const candidates: { entry: ArchiveEntry; target: string | null }[] = [];

  for (const entry of entries) {
    const segments = splitEntryName(entry.name);
    if (!underRoot(segments, rootSegments)) continue;
    const relative = segments.slice(rootSegments.length);
    candidates.push({
      entry,
      // A name that climbs out of the folder is never matched; 7-Zip decides
      // what to do with it when it is extracted.
      target: isSafeSegments(relative)
        ? (() => {
            const target = path.join(destination, ...relative);
            return originals?.get(path.resolve(target)) ?? target;
          })()
        : null,
    });
  }

  const changed: ArchiveEntry[] = [];
  const unchanged: ArchiveEntry[] = [];
  const toHash: { entry: ArchiveEntry; target: string }[] = [];

  for (const { entry, target } of candidates) {
    const stats = target
      ? await fs.promises.lstat(target).catch(() => null)
      : null;
    if (!target || !stats?.isFile() || stats.size !== entry.size) {
      changed.push(entry);
    } else if (entry.size === 0) {
      unchanged.push(entry);
    } else {
      toHash.push({ entry, target });
    }
  }

  const hashBytes = toHash.reduce((sum, { entry }) => sum + entry.size, 0);
  let hashedBytes = 0;
  let next = 0;

  const worker = async () => {
    while (next < toHash.length) {
      const { entry, target } = toHash[next++];
      const crc = await crc32OfFile(target).catch(() => null);
      (crc === entry.crc ? unchanged : changed).push(entry);
      hashedBytes += entry.size;
      onProgress?.(hashBytes === 0 ? 1 : hashedBytes / hashBytes);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(HASH_CONCURRENCY, toHash.length) }, worker)
  );

  return {
    changed,
    changedBytes: changed.reduce((sum, entry) => sum + entry.size, 0),
    unchangedCount: unchanged.length,
    unchangedBytes: unchanged.reduce((sum, entry) => sum + entry.size, 0),
  };
};
