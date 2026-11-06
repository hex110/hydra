import fs from "node:fs";
import path from "node:path";
import { isEqual } from "lodash-es";

import { gamesSublevel, levelKeys } from "@main/level";
import type { SteamDownload } from "@types";

import { getSteamLibraryFolders, getSteamLocation } from "../steam";
import { steamSyncLogger } from "../logger";
import { WindowManager } from "../window-manager";
import {
  computeSteamDownloadBytes,
  describeSteamDownloadStatus,
  measureFolderBytes,
  parseSteamContentLog,
  parseSteamManifestDownload,
  type SteamManifestDownload,
} from "./steam-download-core";
import {
  onSteamAppsChange,
  refreshInstalledState,
} from "./steam-install-watcher";

const ACTIVE_POLL_MS = 1500;
const CHANGE_DEBOUNCE_MS = 250;
/** How long an install Hydra asked for may take to show up in Steam. */
const WAITING_TIMEOUT_MS = 15 * 60 * 1000;
const CONTENT_LOG_TAIL_BYTES = 512 * 1024;
const MIN_STAGING_MEASURE_MS = 3000;
const SPEED_SMOOTHING = 0.3;
/** Steam runs install scripts after the files land; keep trying to link. */
const LINK_RETRY_DELAYS_MS = [0, 2000, 5000, 15000, 30000, 60000];

interface Staging {
  bytes: number;
  nextMeasureAt: number;
}

interface Speed {
  done: number;
  at: number;
  bytesPerSecond: number | null;
}

/** Installs Hydra opened Steam's dialog for, by app id, with when. */
const requested = new Map<string, { title: string; at: number }>();
const staging = new Map<string, Staging>();
const speeds = new Map<string, Speed>();
const maxProgress = new Map<string, number>();
let installingAppIds = new Set<string>();
let downloads: SteamDownload[] = [];
let tickTimer: NodeJS.Timeout | undefined;
let ticking = false;
let tickAgain = false;
let started = false;

const readManifests = async (libraryFolders: string[]) => {
  const manifests = new Map<
    string,
    { manifest: SteamManifestDownload; libraryFolder: string }
  >();

  for (const libraryFolder of libraryFolders) {
    const steamApps = path.join(libraryFolder, "steamapps");
    const fileNames = await fs.promises.readdir(steamApps).catch(() => []);

    for (const fileName of fileNames) {
      if (!/^appmanifest_\d+\.acf$/i.test(fileName)) continue;

      const content = await fs.promises
        .readFile(path.join(steamApps, fileName), "utf8")
        .catch(() => null);
      const manifest = content ? parseSteamManifestDownload(content) : null;
      if (!manifest) continue;

      // An installed copy in any library wins over a stale one elsewhere.
      const known = manifests.get(manifest.appId);
      if (!known || (manifest.installed && !known.manifest.installed)) {
        manifests.set(manifest.appId, { manifest, libraryFolder });
      }
    }
  }

  return manifests;
};

const readContentLogTail = async () => {
  const steamLocation = await getSteamLocation().catch(() => null);
  if (!steamLocation) return "";

  const logPath = path.join(steamLocation, "logs", "content_log.txt");
  const handle = await fs.promises.open(logPath, "r").catch(() => null);
  if (!handle) return "";

  try {
    const { size } = await handle.stat();
    const length = Math.min(size, CONTENT_LOG_TAIL_BYTES);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, size - length);
    return buffer.toString("utf8");
  } catch {
    return "";
  } finally {
    await handle.close();
  }
};

const measureStaging = async (appId: string, libraryFolder: string) => {
  const now = Date.now();
  const known = staging.get(appId);
  if (known && now < known.nextMeasureAt) return known.bytes;

  const bytes = await measureFolderBytes(
    path.join(libraryFolder, "steamapps", "downloading", appId)
  );
  const tookMs = Date.now() - now;
  staging.set(appId, {
    bytes,
    nextMeasureAt: now + Math.max(MIN_STAGING_MEASURE_MS, tookMs * 10),
  });
  return bytes;
};

const updateSpeed = (appId: string, done: number, ratio: number) => {
  const now = Date.now();
  const last = speeds.get(appId);

  if (!last || done < last.done) {
    speeds.set(appId, { done, at: now, bytesPerSecond: null });
    return { growing: false, bytesPerSecond: null };
  }

  if (done === last.done) {
    // Staging is measured every few seconds; only call it stalled after that.
    const stalled = now - last.at > MIN_STAGING_MEASURE_MS * 2;
    if (stalled) speeds.set(appId, { ...last, bytesPerSecond: null });
    return {
      growing: !stalled && last.bytesPerSecond !== null,
      bytesPerSecond: stalled ? null : last.bytesPerSecond,
    };
  }

  const instant = ((done - last.done) / ((now - last.at) / 1000)) * ratio;
  const bytesPerSecond =
    last.bytesPerSecond === null
      ? instant
      : last.bytesPerSecond + SPEED_SMOOTHING * (instant - last.bytesPerSecond);
  speeds.set(appId, { done, at: now, bytesPerSecond });
  return { growing: true, bytesPerSecond };
};

const libraryTitle = async (appId: string) => {
  const game = await gamesSublevel
    .get(levelKeys.game("steam", appId))
    .catch(() => null);
  return game && !game.isDeleted ? game.title : null;
};

const linkFinishedInstall = (appId: string) => {
  const attempt = async (index: number) => {
    if (await refreshInstalledState(appId).catch(() => false)) return;

    const next = LINK_RETRY_DELAYS_MS[index + 1];
    if (next === undefined) {
      steamSyncLogger.warn(
        `Steam finished installing ${appId} but no executable was linked`
      );
      return;
    }
    setTimeout(() => void attempt(index + 1), next);
  };

  void attempt(0);
};

const forget = (appId: string) => {
  staging.delete(appId);
  speeds.delete(appId);
  maxProgress.delete(appId);
};

const collect = async (): Promise<SteamDownload[]> => {
  const libraryFolders = await getSteamLibraryFolders().catch(() => []);
  const manifests = await readManifests(libraryFolders);

  const installing = [...manifests.values()].filter(
    ({ manifest }) => manifest.installing
  );
  const nextInstalling = new Set(
    installing.map(({ manifest }) => manifest.appId)
  );

  for (const appId of installingAppIds) {
    if (nextInstalling.has(appId)) continue;

    forget(appId);
    if (manifests.get(appId)?.manifest.installed) {
      steamSyncLogger.log(`Steam finished installing ${appId}`);
      linkFinishedInstall(appId);
    }
  }
  installingAppIds = nextInstalling;

  const now = Date.now();
  for (const [appId, request] of requested) {
    if (
      nextInstalling.has(appId) ||
      manifests.get(appId)?.manifest.installed ||
      now - request.at > WAITING_TIMEOUT_MS
    ) {
      requested.delete(appId);
    }
  }

  const log =
    installing.length > 0
      ? parseSteamContentLog(await readContentLogTail(), nextInstalling)
      : new Map();

  const result: SteamDownload[] = [];

  for (const { manifest, libraryFolder } of installing) {
    const title =
      (await libraryTitle(manifest.appId)) ??
      requested.get(manifest.appId)?.title;
    // Steam also installs tools and runtimes; only games Hydra knows count.
    if (!title) continue;

    const appLog = log.get(manifest.appId);
    const bytes = computeSteamDownloadBytes(
      manifest,
      appLog,
      await measureStaging(manifest.appId, libraryFolder)
    );
    const ratio =
      manifest.bytesToStage > 0 && manifest.bytesToDownload > 0
        ? manifest.bytesToDownload / manifest.bytesToStage
        : 1;
    const speed = bytes
      ? updateSpeed(manifest.appId, bytes.done, ratio)
      : { growing: false, bytesPerSecond: null };
    const status = describeSteamDownloadStatus(appLog, speed.growing);

    let progress = bytes ? Math.min(bytes.done / bytes.total, 0.999) : null;
    if (progress !== null) {
      // The staging folder empties as Steam commits; never step backwards.
      progress = Math.max(progress, maxProgress.get(manifest.appId) ?? 0);
      maxProgress.set(manifest.appId, progress);
    }

    result.push({
      appId: manifest.appId,
      title,
      status,
      progress,
      bytesDone: bytes && progress !== null ? progress * bytes.total : null,
      bytesTotal: bytes?.total ?? null,
      bytesPerSecond: status === "downloading" ? speed.bytesPerSecond : null,
    });
  }

  for (const [appId, request] of requested) {
    const title = (await libraryTitle(appId)) ?? request.title;
    if (!title) continue;

    result.push({
      appId,
      title,
      status: "waiting",
      progress: null,
      bytesDone: null,
      bytesTotal: null,
      bytesPerSecond: null,
    });
  }

  return result;
};

const scheduleTick = (delayMs: number) => {
  clearTimeout(tickTimer);
  tickTimer = setTimeout(() => void tick(), delayMs);
};

const tick = async () => {
  if (ticking) {
    tickAgain = true;
    return;
  }
  ticking = true;

  try {
    const next = await collect();
    if (!isEqual(next, downloads)) {
      downloads = next;
      WindowManager.sendToAppWindows("on-steam-downloads-changed", downloads);
    }
  } catch (error) {
    steamSyncLogger.error("Failed to read Steam downloads", error);
  } finally {
    ticking = false;
  }

  if (tickAgain) {
    tickAgain = false;
    scheduleTick(0);
  } else if (downloads.length > 0 || requested.size > 0) {
    scheduleTick(ACTIVE_POLL_MS);
  }
};

export const SteamDownloads = {
  /** Starts watching; manifest changes wake it, and it polls while busy. */
  start() {
    if (started) return;
    started = true;

    onSteamAppsChange(() => scheduleTick(CHANGE_DEBOUNCE_MS));
    scheduleTick(0);
  },

  /** Hydra opened Steam's install dialog for this game. */
  expect(appId: string, title: string) {
    requested.set(appId, { title, at: Date.now() });
    scheduleTick(0);
  },

  dismiss(appId: string) {
    if (!requested.delete(appId)) return;
    scheduleTick(0);
  },

  list: () => downloads,
};
