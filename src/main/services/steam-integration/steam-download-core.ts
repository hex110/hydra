import fs from "node:fs";
import path from "node:path";

import type { SteamDownloadStatus } from "@types";

// Steam's EAppState bits, as written to StateFlags in an app manifest.
const STATE_UPDATE_REQUIRED = 2;
const STATE_FULLY_INSTALLED = 4;
const STATE_UPDATE_RUNNING = 256;
const STATE_UPDATE_PAUSED = 512;
const STATE_UPDATE_STARTED = 1024;

const IN_PROGRESS_FLAGS =
  STATE_UPDATE_REQUIRED |
  STATE_UPDATE_RUNNING |
  STATE_UPDATE_PAUSED |
  STATE_UPDATE_STARTED;

const readValue = (content: string, key: string): string | null =>
  new RegExp(`"${key}"\\s*"((?:\\\\.|[^"\\\\])*)"`, "i").exec(content)?.[1] ??
  null;

const readNumber = (content: string, key: string) => {
  const value = Number(readValue(content, key));
  return Number.isFinite(value) && value > 0 ? value : 0;
};

export interface SteamManifestDownload {
  appId: string;
  name: string | null;
  installDirectoryName: string | null;
  installed: boolean;
  /** A first install Steam has been asked for and has not finished. */
  installing: boolean;
  bytesToDownload: number;
  bytesDownloaded: number;
  bytesToStage: number;
  bytesStaged: number;
}

export const parseSteamManifestDownload = (
  content: string
): SteamManifestDownload | null => {
  const appId = readValue(content, "appid");
  if (!appId || !/^\d+$/.test(appId)) return null;

  const flags = Number(readValue(content, "StateFlags"));
  const validFlags = Number.isInteger(flags) ? flags : 0;
  const installed = (validFlags & STATE_FULLY_INSTALLED) !== 0;

  return {
    appId,
    name: readValue(content, "name"),
    installDirectoryName: readValue(content, "installdir"),
    installed,
    installing: !installed && (validFlags & IN_PROGRESS_FLAGS) !== 0,
    bytesToDownload: readNumber(content, "BytesToDownload"),
    bytesDownloaded: readNumber(content, "BytesDownloaded"),
    bytesToStage: readNumber(content, "BytesToStage"),
    bytesStaged: readNumber(content, "BytesStaged"),
  };
};

export interface SteamContentLogApp {
  /** Latest "state changed" flags, e.g. ["Update Required", "Update Running"]. */
  state: string[] | null;
  /** Latest "App update changed" flags, e.g. ["Running Update", "Downloading"]. */
  update: string[] | null;
  suspended: boolean;
  /** Totals from the latest "update started" line. */
  totals: { download: number; stage: number } | null;
}

const LOG_LINE =
  /^\[[^\]]*\] AppID (\d+) (state changed|App update changed|update started) : (.*)$/;
const UPDATE_STARTED_TOTALS = /download \d+\/(\d+),.*stage \d+\/(\d+)/;

const splitFlags = (value: string) =>
  value
    .replace(/\(.*$/, "")
    .split(",")
    .map((flag) => flag.trim())
    .filter(Boolean);

/** The latest content_log.txt facts for each wanted app. */
export const parseSteamContentLog = (
  log: string,
  appIds: Set<string>
): Map<string, SteamContentLogApp> => {
  const apps = new Map<string, SteamContentLogApp>();

  for (const line of log.split(/\r?\n/)) {
    const match = LOG_LINE.exec(line);
    if (!match || !appIds.has(match[1])) continue;

    const [, appId, kind, rest] = match;
    const app = apps.get(appId) ?? {
      state: null,
      update: null,
      suspended: false,
      totals: null,
    };

    if (kind === "state changed") {
      app.state = splitFlags(rest);
      app.suspended = /\(Suspended\)|\bPaused\b/i.test(rest);
    } else if (kind === "App update changed") {
      app.update = splitFlags(rest);
    } else {
      const totals = UPDATE_STARTED_TOTALS.exec(rest);
      if (totals) {
        app.totals = { download: Number(totals[1]), stage: Number(totals[2]) };
      }
    }

    apps.set(appId, app);
  }

  return apps;
};

export const describeSteamDownloadStatus = (
  log: SteamContentLogApp | undefined,
  isGrowing: boolean
): SteamDownloadStatus => {
  if (isGrowing) return "downloading";
  if (!log?.state) return "paused";

  if (log.state.includes("Update Running")) {
    return log.update?.includes("Committing") ? "finishing" : "downloading";
  }

  if (log.suspended || log.state.includes("Update Paused")) return "paused";

  return log.state.includes("Update Queued") ? "queued" : "paused";
};

export interface SteamDownloadBytes {
  done: number;
  total: number;
}

/**
 * Steam stages a download in `steamapps/downloading/<appid>` and only rewrites
 * the manifest's byte counts now and then, so the staging folder's size is the
 * live figure; the manifest and the log fill in the totals.
 */
export const computeSteamDownloadBytes = (
  manifest: SteamManifestDownload,
  log: SteamContentLogApp | undefined,
  stagingBytes: number | null
): SteamDownloadBytes | null => {
  const stageTotal = manifest.bytesToStage || log?.totals?.stage || 0;
  if (stageTotal > 0) {
    return {
      done: Math.min(
        Math.max(manifest.bytesStaged, stagingBytes ?? 0),
        stageTotal
      ),
      total: stageTotal,
    };
  }

  const downloadTotal = manifest.bytesToDownload || log?.totals?.download || 0;
  if (downloadTotal > 0) {
    return {
      done: Math.min(manifest.bytesDownloaded, downloadTotal),
      total: downloadTotal,
    };
  }

  return null;
};

/** Bytes a folder holds on disk; sparse preallocation does not count. */
export const measureFolderBytes = async (folder: string): Promise<number> => {
  let total = 0;
  const entries = await fs.promises
    .readdir(folder, { withFileTypes: true, recursive: true })
    .catch(() => [] as fs.Dirent[]);

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    const stats = await fs.promises
      .stat(path.join(entry.parentPath, entry.name))
      .catch(() => null);
    if (stats) total += Math.min(stats.size, stats.blocks * 512);
  }

  return total;
};

/** Install folders of Steam apps whose first install has not finished. */
export const listUnfinishedSteamInstallDirectories = async (
  libraryFolders: string[]
): Promise<string[]> => {
  const directories: string[] = [];

  for (const libraryFolder of libraryFolders) {
    const steamApps = path.join(libraryFolder, "steamapps");
    const fileNames = await fs.promises.readdir(steamApps).catch(() => []);

    for (const fileName of fileNames) {
      if (!/^appmanifest_\d+\.acf$/i.test(fileName)) continue;

      const content = await fs.promises
        .readFile(path.join(steamApps, fileName), "utf8")
        .catch(() => null);
      const manifest = content ? parseSteamManifestDownload(content) : null;
      if (!manifest || manifest.installed || !manifest.installDirectoryName) {
        continue;
      }

      directories.push(
        path.join(steamApps, "common", manifest.installDirectoryName)
      );
    }
  }

  return directories;
};
