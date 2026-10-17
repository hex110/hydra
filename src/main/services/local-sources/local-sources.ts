import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { net } from "electron";
import { db, downloadSourcesSublevel, levelKeys } from "@main/level";
import { logger } from "@main/services/logger";
import { SystemPath } from "@main/services/system-path";
import {
  buildSourceIndex,
  parseSourceDocument,
  sourceMatchKey,
  toLocalRepack,
  type SourceDownload,
  type SourceIndex,
} from "@shared";
import type {
  DownloadSource,
  GameRepack,
  LocalSourceStatus,
  UserPreferences,
} from "@types";

const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_DOCUMENT_BYTES = 200 * 1024 * 1024;

interface CachedSource {
  url: string;
  fetchedAt: number;
  downloads: SourceDownload[];
}

const getCacheDirectory = () =>
  path.join(SystemPath.getPath("userData"), "download-sources");
const getCachePath = (sourceId: string) =>
  path.join(getCacheDirectory(), `${encodeURIComponent(sourceId)}.json`);
const getStatusPath = () => path.join(getCacheDirectory(), "status.json");

const readJson = async <T>(filePath: string): Promise<T | null> => {
  try {
    return JSON.parse(await fs.promises.readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
};

const writeJson = async (filePath: string, value: unknown) => {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  await fs.promises.writeFile(temporaryPath, JSON.stringify(value));
  await fs.promises.rename(temporaryPath, filePath);
};

const isCloudflareChallenge = (response: Response, body: string) =>
  response.headers.get("cf-mitigated") === "challenge" ||
  body.includes("<title>Just a moment...</title>");

/**
 * Keeps Hydra's own copy of every download source and matches games against
 * it by title, so a game shows downloads even when the server's matching
 * missed them.
 */
export class LocalSources {
  private static readonly indexes = new Map<string, SourceIndex>();
  private static readonly refreshes = new Map<string, Promise<void>>();
  private static statuses: Record<string, LocalSourceStatus> | null = null;

  public static async isEnabled() {
    const preferences = await db
      .get<string, UserPreferences | null>(levelKeys.userPreferences, {
        valueEncoding: "json",
      })
      .catch(() => null);
    return preferences?.matchDownloadSourcesLocally !== false;
  }

  public static async getStatuses(): Promise<LocalSourceStatus[]> {
    this.statuses ??=
      (await readJson<Record<string, LocalSourceStatus>>(getStatusPath())) ??
      {};
    return Object.values(this.statuses);
  }

  private static async setStatus(status: LocalSourceStatus) {
    await this.getStatuses();
    this.statuses![status.sourceId] = status;
    await writeJson(getStatusPath(), this.statuses);
  }

  /** Downloads a source again when its copy is missing, stale or `force` is set. */
  public static refresh(source: DownloadSource, force = false): Promise<void> {
    const running = this.refreshes.get(source.id);
    if (running) return running;

    const refresh = this.runRefresh(source, force).finally(() =>
      this.refreshes.delete(source.id)
    );
    this.refreshes.set(source.id, refresh);
    return refresh;
  }

  private static async runRefresh(source: DownloadSource, force: boolean) {
    const cached = await readJson<CachedSource>(getCachePath(source.id));
    if (
      !force &&
      cached?.url === source.url &&
      Date.now() - cached.fetchedAt < REFRESH_INTERVAL_MS
    ) {
      return;
    }

    try {
      const response = await net.fetch(source.url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { Accept: "application/json" },
      });
      const body = await response.text();

      if (isCloudflareChallenge(response, body)) {
        throw new Error("Blocked by a Cloudflare challenge");
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (body.length > MAX_DOCUMENT_BYTES) {
        throw new Error("The source is too large");
      }

      let document: unknown;
      try {
        document = JSON.parse(body);
      } catch {
        throw new Error("The source did not return JSON");
      }

      const parsed = parseSourceDocument(document);
      if (!parsed) throw new Error("Not a download source");

      const fetchedAt = Date.now();
      await writeJson(getCachePath(source.id), {
        url: source.url,
        fetchedAt,
        downloads: parsed.downloads,
      } satisfies CachedSource);
      this.indexes.set(source.id, buildSourceIndex(parsed.downloads));

      await this.setStatus({
        sourceId: source.id,
        state: "ready",
        entries: parsed.downloads.length,
        fetchedAt: new Date(fetchedAt).toISOString(),
        error: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn("[LocalSources] Could not download source", {
        name: source.name,
        url: source.url,
        error: message,
      });

      // The previous copy is still better than nothing.
      await this.setStatus({
        sourceId: source.id,
        state: "failed",
        entries: cached?.downloads.length ?? 0,
        fetchedAt: cached ? new Date(cached.fetchedAt).toISOString() : null,
        error: message,
      });
    }
  }

  public static async refreshAll(force = false) {
    if (!(await this.isEnabled())) return;
    const sources = await downloadSourcesSublevel.values().all();
    for (const source of sources) {
      await this.refresh(source, force);
    }
  }

  public static async forget(sourceId: string) {
    this.indexes.delete(sourceId);
    await fs.promises.rm(getCachePath(sourceId), { force: true });
    await this.getStatuses();
    if (this.statuses && sourceId in this.statuses) {
      delete this.statuses[sourceId];
      await writeJson(getStatusPath(), this.statuses);
    }
  }

  private static async getIndex(sourceId: string) {
    const loaded = this.indexes.get(sourceId);
    if (loaded) return loaded;

    const cached = await readJson<CachedSource>(getCachePath(sourceId));
    if (!cached) return null;

    const index = buildSourceIndex(cached.downloads);
    this.indexes.set(sourceId, index);
    return index;
  }

  /** Downloads from every source whose release title names this game. */
  public static async findRepacks(title: string): Promise<GameRepack[]> {
    const key = sourceMatchKey(title);
    if (!key || !(await this.isEnabled())) return [];

    const sources = await downloadSourcesSublevel.values().all();
    const repacks: GameRepack[] = [];

    for (const source of sources) {
      const index = await this.getIndex(source.id);
      for (const download of index?.get(key) ?? []) {
        repacks.push(toLocalRepack(download, source));
      }
    }

    return repacks;
  }
}
