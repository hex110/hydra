import fs from "node:fs";
import path from "node:path";
import { db, levelKeys } from "@main/level";
import { logger } from "@main/services/logger";
import { SystemPath } from "@main/services/system-path";
import {
  JsHttpDownloader,
  type JsHttpDownloaderOptions,
  type JsHttpDownloaderStatus,
} from "@main/services/download/js-http-downloader";
import {
  DownloadError,
  matchBrowserDownload,
  type AnkerGamesGamePage,
  parseAnkerGamesPageUri,
  parseRepackSize,
} from "@shared";
import type { UserPreferences } from "@types";
import { AnkerGamesCatalogue } from "./catalogue";
import {
  getAnkerGamesPageOpenedAt,
  openAnkerGamesDownloadPage,
} from "./resolve-download";

const POLL_INTERVAL_MS = 1000;
/** Give up when no file has appeared this long after the page was opened. */
const NOTHING_APPEARED_TIMEOUT_MS = 30 * 60 * 1000;

export const getBrowserDownloadsDirectory = async () => {
  const preferences = await db
    .get<string, UserPreferences | null>(levelKeys.userPreferences, {
      valueEncoding: "json",
    })
    .catch(() => null);
  return (
    preferences?.ankerGamesBrowserDownloadsPath ||
    SystemPath.getPath("downloads")
  );
};

const moveFile = async (from: string, to: string) => {
  await fs.promises.mkdir(path.dirname(to), { recursive: true });
  try {
    await fs.promises.rename(from, to);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
    await fs.promises.copyFile(from, to);
    await fs.promises.unlink(from);
  }
};

interface FoundFile {
  name: string;
  size: number;
}

/**
 * This game's archive in the browser's folder. A finished archive older than
 * AnkerGames' last update of the game is an old version and is ignored.
 */
const findBrowserDownload = async (
  directory: string,
  slug: string,
  page: AnkerGamesGamePage | null
): Promise<{ file: FoundFile | null; partial: FoundFile | null }> => {
  const names = await fs.promises.readdir(directory).catch(() => []);
  const match = matchBrowserDownload(names, slug);
  const statOf = async (name: string | null) => {
    if (!name) return null;
    const stats = await fs.promises.stat(path.join(directory, name));
    return { name, size: stats.size, modified: stats.mtimeMs };
  };

  const [file, partial] = await Promise.all([
    statOf(match.file),
    statOf(match.partial),
  ]);
  const updatedAt = page?.modifiedAt ? Date.parse(page.modifiedAt) : Number.NaN;
  const isCurrent =
    !!file && (Number.isNaN(updatedAt) || file.modified >= updatedAt);

  return {
    file: file && isCurrent ? { name: file.name, size: file.size } : null,
    partial: partial ? { name: partial.name, size: partial.size } : null,
  };
};

/** True when the browser already saved this game's current archive, or is saving it. */
export const hasBrowserDownload = async (pageUri: string) => {
  const slug = parseAnkerGamesPageUri(pageUri);
  if (!slug) return false;
  const [directory, page] = await Promise.all([
    getBrowserDownloadsDirectory(),
    AnkerGamesCatalogue.getPage(slug),
  ]);
  const found = await findBrowserDownload(directory, slug, page);
  return !!found.partial || (!!found.file && found.file.size > 0);
};

/**
 * Stands in for the HTTP downloader while the person's browser downloads an
 * AnkerGames archive: it follows the browser's file in the Downloads folder,
 * reports its progress, and moves the finished archive to the game's download
 * folder so extraction and setup run as for any other download. Pausing or
 * cancelling stops the watch only; the browser's download is its own.
 */
export class AnkerGamesBrowserDownload extends JsHttpDownloader {
  private timer: NodeJS.Timeout | null = null;
  private settle: ((error?: Error) => void) | null = null;
  private started = false;
  private state: JsHttpDownloaderStatus["status"] = "paused";
  private folder = "";
  private bytes = 0;
  private size = 0;
  private speed = 0;
  private lastPoll = { at: 0, bytes: 0 };
  private finishedSize: number | null = null;
  private waitingSince = 0;

  override async startDownload(options: JsHttpDownloaderOptions) {
    this.stopWatching();
    const pageUri = options.resourceId ?? options.url;
    const slug = parseAnkerGamesPageUri(pageUri);
    if (!slug) throw new Error(DownloadError.AnkerGamesUnavailable);

    const [directory, page] = await Promise.all([
      getBrowserDownloadsDirectory(),
      AnkerGamesCatalogue.getPage(slug),
    ]);
    this.started = true;
    this.state = "active";
    this.size = parseRepackSize(page?.fileSize ?? null) ?? 0;
    this.finishedSize = null;
    this.waitingSince = getAnkerGamesPageOpenedAt(pageUri) ?? Date.now();
    let reopened = getAnkerGamesPageOpenedAt(pageUri) !== null;

    logger.log("[AnkerGames] Watching the browser's downloads", {
      slug,
      directory,
    });

    await new Promise<void>((resolve, reject) => {
      this.settle = (error) => {
        this.settle = null;
        this.stopWatching();
        if (error) reject(error);
        else resolve();
      };

      const poll = async () => {
        try {
          const found = await findBrowserDownload(directory, slug, page);

          if (found.partial) {
            this.track(found.partial.size);
            this.finishedSize = null;
          } else if (found.file) {
            const { name, size } = found.file;
            // A finished file keeps its size across two polls.
            if (size > 0 && size === this.finishedSize) {
              await moveFile(
                path.join(directory, name),
                path.join(options.savePath, name)
              );
              this.folder = name;
              this.bytes = size;
              this.size = size;
              this.speed = 0;
              this.state = "complete";
              logger.log("[AnkerGames] Browser download picked up", { name });
              this.settle?.();
              return;
            }
            this.finishedSize = size;
            this.track(size);
          } else if (!reopened) {
            // Resumed with nothing in the folder: the page has to be opened again.
            reopened = true;
            await openAnkerGamesDownloadPage(pageUri, page?.name ?? slug);
            this.waitingSince = Date.now();
          } else if (
            Date.now() - this.waitingSince >
            NOTHING_APPEARED_TIMEOUT_MS
          ) {
            throw new Error(DownloadError.AnkerGamesBrowserDownloadMissing);
          }
        } catch (error) {
          this.state = "error";
          this.settle?.(
            error instanceof Error ? error : new Error(String(error))
          );
          return;
        }
        if (this.settle) this.timer = setTimeout(poll, POLL_INTERVAL_MS);
      };

      void poll();
    });
  }

  private track(bytes: number) {
    const now = Date.now();
    if (this.lastPoll.at > 0 && now > this.lastPoll.at) {
      const delta = Math.max(0, bytes - this.lastPoll.bytes);
      this.speed = (delta * 1000) / (now - this.lastPoll.at);
    }
    this.lastPoll = { at: now, bytes };
    this.bytes = bytes;
    if (bytes > this.size) this.size = bytes;
  }

  private stopWatching() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  override pauseDownload() {
    if (this.state !== "complete") this.state = "paused";
    this.speed = 0;
    this.settle?.();
  }

  override cancelDownload() {
    this.pauseDownload();
  }

  override async waitForIdle() {
    return undefined;
  }

  override getDownloadStatus(): JsHttpDownloaderStatus | null {
    if (!this.started) return null;
    return {
      folderName: this.folder,
      fileSize: this.size,
      progress:
        this.state === "complete"
          ? 1
          : this.size > 0
            ? Math.min(0.99, this.bytes / this.size)
            : 0,
      downloadSpeed: this.speed,
      numPeers: 0,
      numSeeds: 0,
      status: this.state,
      bytesDownloaded: this.bytes,
      isReconnecting: false,
      isRecovering: false,
      recoveryProgress: 0,
    };
  }
}
