import fs from "node:fs";
import path from "node:path";

import type { UserPreferences } from "@types";
import { db, levelKeys } from "@main/level";
import { logger } from "./logger";
import { refreshAllExecutableStatuses } from "./executable-status";

const SETTLE_DELAY_MS = 15_000;
const STABLE_CHECK_INTERVAL_MS = 20_000;
const MAX_STABLE_CHECKS = 90;
const MAX_SIGNATURE_ENTRIES = 50_000;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** File count and total size below a folder; changes while a copy is running. */
const getFolderSignature = async (target: string): Promise<string> => {
  let files = 0;
  let bytes = 0;
  const pending = [target];

  while (pending.length > 0 && files < MAX_SIGNATURE_ENTRIES) {
    const current = pending.pop()!;
    const stats = await fs.promises.lstat(current).catch(() => null);
    if (!stats) continue;

    if (stats.isDirectory()) {
      const entries = await fs.promises.readdir(current).catch(() => []);
      pending.push(...entries.map((entry) => path.join(current, entry)));
    } else {
      files++;
      bytes += stats.size;
    }
  }

  return `${files}:${bytes}`;
};

const getSignature = async (targets: string[]) =>
  (await Promise.all(targets.map(getFolderSignature))).join("|");

/**
 * Watches the top level of each library folder and runs a background scan
 * once a game folder was added or removed and has stopped changing.
 */
export class LibraryFolderWatcher {
  private static readonly watchers = new Map<string, fs.FSWatcher>();
  private static readonly changed = new Set<string>();
  private static settleTimer: NodeJS.Timeout | null = null;
  private static running = false;
  private static applyTimer: NodeJS.Timeout | null = null;

  static watch() {
    db.on("write", (operations: { key?: unknown }[]) => {
      if (operations.some(({ key }) => key === levelKeys.userPreferences)) {
        this.scheduleApply();
      }
    });
    this.scheduleApply();
  }

  private static scheduleApply() {
    if (this.applyTimer) clearTimeout(this.applyTimer);
    this.applyTimer = setTimeout(() => {
      this.applyTimer = null;
      void this.apply();
    }, 1000);
  }

  private static async apply() {
    const preferences = await db
      .get<string, UserPreferences | null>(levelKeys.userPreferences, {
        valueEncoding: "json",
      })
      .catch(() => null);

    const folders = new Set(
      preferences?.watchLibraryFolders
        ? (preferences.libraryScanDirectories ?? [])
        : []
    );

    for (const [folder, watcher] of this.watchers) {
      if (!folders.has(folder)) {
        watcher.close();
        this.watchers.delete(folder);
      }
    }

    for (const folder of folders) {
      if (!this.watchers.has(folder)) this.watchFolder(folder);
    }
  }

  private static watchFolder(folder: string) {
    try {
      const watcher = fs.watch(folder, { persistent: false }, (_, name) => {
        if (!name) return;
        this.changed.add(path.join(folder, name.toString()));
        this.scheduleScan();
      });
      watcher.on("error", (error) => {
        logger.warn(`[LibraryFolderWatcher] Stopped watching ${folder}`, error);
        watcher.close();
        this.watchers.delete(folder);
      });
      this.watchers.set(folder, watcher);
      logger.info(`[LibraryFolderWatcher] Watching ${folder}`);
    } catch (error) {
      logger.warn(`[LibraryFolderWatcher] Can't watch ${folder}`, error);
    }
  }

  private static scheduleScan() {
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => {
      this.settleTimer = null;
      void this.scanWhenSettled();
    }, SETTLE_DELAY_MS);
  }

  private static async scanWhenSettled() {
    if (this.running) return;
    this.running = true;

    try {
      const targets = [...this.changed];
      this.changed.clear();

      // Wait for copies and extractions into the folder to finish.
      let previous = await getSignature(targets);
      for (let check = 0; check < MAX_STABLE_CHECKS; check++) {
        await wait(STABLE_CHECK_INTERVAL_MS);
        const current = await getSignature(targets);
        if (current === previous) break;
        previous = current;
      }

      logger.info(
        `[LibraryFolderWatcher] Library folders changed (${targets.length} entries), scanning`
      );
      const { scanLibraryFoldersInBackground } = await import(
        "@main/events/library/scan-installed-games"
      );
      await scanLibraryFoldersInBackground();
      await refreshAllExecutableStatuses();
    } catch (error) {
      logger.error("[LibraryFolderWatcher] Scan failed", error);
    } finally {
      this.running = false;
      if (this.changed.size > 0) this.scheduleScan();
    }
  }
}
