import type { GameRepack } from "@types";
import { cleanReleaseName, comparableTitle } from "./title-matching.js";

/** One entry of a download source JSON (`{ name, downloads: [...] }`). */
export interface SourceDownload {
  title: string;
  uris: string[];
  uploadDate: string | null;
  fileSize: string | null;
}

export interface ParsedSourceDocument {
  name: string | null;
  downloads: SourceDownload[];
}

const asString = (value: unknown) =>
  typeof value === "string" && value.trim() ? value : null;

/** Validates a download source document, dropping malformed entries. */
export const parseSourceDocument = (
  document: unknown
): ParsedSourceDocument | null => {
  if (!document || typeof document !== "object") return null;
  const { name, downloads } = document as Record<string, unknown>;
  if (!Array.isArray(downloads)) return null;

  const parsed: SourceDownload[] = [];
  for (const entry of downloads) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const title = asString(record.title);
    const uris = Array.isArray(record.uris)
      ? record.uris.filter((uri): uri is string => !!asString(uri))
      : [];
    if (!title || uris.length === 0) continue;

    parsed.push({
      title,
      uris,
      uploadDate: asString(record.uploadDate),
      fileSize: asString(record.fileSize),
    });
  }

  return { name: asString(name), downloads: parsed };
};

/** The key a release title and a catalogue title share when they are the same game. */
export const sourceMatchKey = (title: string) =>
  comparableTitle(cleanReleaseName(title));

export type SourceIndex = Map<string, SourceDownload[]>;

export const buildSourceIndex = (downloads: SourceDownload[]): SourceIndex => {
  const index: SourceIndex = new Map();
  for (const download of downloads) {
    const key = sourceMatchKey(download.title);
    if (!key) continue;
    const bucket = index.get(key);
    if (bucket) bucket.push(download);
    else index.set(key, [download]);
  }
  return index;
};

const hashString = (value: string) => {
  let hash = 5381;
  for (let index = 0; index < value.length; index++) {
    hash = ((hash << 5) + hash + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
};

export const toLocalRepack = (
  download: SourceDownload,
  source: { id: string; name: string; createdAt: string }
): GameRepack => ({
  id: `local-${source.id}-${hashString(download.uris.join("\n"))}`,
  title: download.title,
  fileSize: download.fileSize,
  uris: download.uris,
  unavailableUris: [],
  uploadDate: download.uploadDate,
  downloadSourceId: source.id,
  downloadSourceName: source.name,
  createdAt: source.createdAt,
});

const isNewer = (candidate: string | null, current: string | null) =>
  !!candidate &&
  (!current || new Date(candidate).getTime() > new Date(current).getTime());

/**
 * Adds locally matched repacks to the server's list. A local repack sharing
 * a URI with a server repack is the same download: it is not added again,
 * but when the local copy is newer (sources reuse links across versions) its
 * title, size and date replace the server's stale ones.
 */
export const mergeLocalRepacks = <
  T extends Pick<GameRepack, "uris" | "title" | "fileSize" | "uploadDate">,
>(
  serverRepacks: T[],
  localRepacks: T[]
): T[] => {
  const merged = [...serverRepacks];
  const byUri = new Map<string, number>();
  merged.forEach((repack, index) =>
    repack.uris.forEach((uri) => byUri.set(uri, index))
  );

  for (const repack of localRepacks) {
    const existingIndex = repack.uris
      .map((uri) => byUri.get(uri))
      .find((index) => index !== undefined);

    if (existingIndex === undefined) {
      repack.uris.forEach((uri) => byUri.set(uri, merged.length));
      merged.push(repack);
      continue;
    }

    const existing = merged[existingIndex];
    if (isNewer(repack.uploadDate, existing.uploadDate)) {
      merged[existingIndex] = {
        ...existing,
        title: repack.title,
        fileSize: repack.fileSize ?? existing.fileSize,
        uploadDate: repack.uploadDate,
      };
    }
  }

  return merged;
};
