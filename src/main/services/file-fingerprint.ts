import fs from "node:fs";
import path from "node:path";
import type { FileFingerprint } from "@types";
import { crc32OfFile } from "./delta-extraction.js";

export const fingerprintFile = async (
  filePath: string
): Promise<FileFingerprint> => {
  const stats = await fs.promises.stat(filePath);
  return { size: stats.size, crc: await crc32OfFile(filePath) };
};

/** Fingerprints of `files` (relative to `directory`) that exist. */
export const fingerprintFiles = async (
  directory: string,
  files: string[]
): Promise<Record<string, FileFingerprint>> => {
  const fingerprints: Record<string, FileFingerprint> = {};
  for (const file of files) {
    const fingerprint = await fingerprintFile(path.join(directory, file)).catch(
      () => null
    );
    if (fingerprint) fingerprints[file] = fingerprint;
  }
  return fingerprints;
};

/**
 * Files a tool put over the game's own that something else has replaced since
 * (a game update, a launcher's file check): they now belong to the game, so
 * removing the tool must keep them and not restore its stale backup. Files
 * without a recorded fingerprint (older installs) are never reported.
 */
export const findReplacedToolFiles = async (
  directory: string,
  manifest: {
    backups: string[];
    fingerprints?: Record<string, FileFingerprint>;
  }
): Promise<Set<string>> => {
  const replaced = new Set<string>();
  for (const file of manifest.backups) {
    const expected = manifest.fingerprints?.[file];
    if (!expected) continue;
    const target = path.join(directory, file);
    const stats = await fs.promises.stat(target).catch(() => null);
    if (!stats?.isFile()) continue;
    if (
      stats.size !== expected.size ||
      (await crc32OfFile(target).catch(() => null)) !== expected.crc
    )
      replaced.add(file);
  }
  return replaced;
};
