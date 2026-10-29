import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import axios from "axios";
import { RENODX_INDEX_URL, parseRenoDxIndex } from "@shared";
import type { RenoDxArtifact, RenoDxGameEntry } from "@types";
import {
  getDirectorySize,
  listDirectories,
  readJson,
  writeJson,
} from "@main/services/cache-files";
import { downloadToFile } from "@main/services/download-to-file";
import { logger } from "@main/services/logger";
import { SystemPath } from "@main/services/system-path";

const CATALOGUE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 20_000;
const KEPT_ADD_ON_VERSIONS = 2;
const REMOTE_VERSION_MS = 30 * 60 * 1000;

export interface RenoDxCatalogue {
  games: RenoDxGameEntry[];
  fetchedAt: number;
}

interface CatalogueCache {
  fetchedAt: number;
  /** The index exactly as downloaded, parsed again on every load. */
  text: string;
}

const getRootDirectory = () =>
  path.join(SystemPath.getPath("userData"), "renodx");
const getCataloguePath = () =>
  path.join(getRootDirectory(), "games-index.json");
const getAddOnsDirectory = () => path.join(getRootDirectory(), "addons");

/** A folder name for an add-on version: its Last-Modified date, else a hash. */
const toVersionKey = (lastModified: string | null, file: string) => {
  const date = lastModified ? new Date(lastModified) : null;
  if (date && !Number.isNaN(date.getTime())) {
    return date.toISOString().replaceAll(":", "-");
  }
  const hash = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  return `sha256-${hash.slice(0, 12)}`;
};

/**
 * RenoDX's game catalogue and its add-on files, cached under
 * `<userData>/renodx`. Add-ons are rebuilt often, so each one is kept as a
 * few dated copies and the version is the build's Last-Modified date.
 */
export class RenoDxAssets {
  private static readonly inflight = new Map<string, Promise<unknown>>();
  private static readonly remoteVersions = new Map<
    string,
    { version: string | null; checkedAt: number }
  >();

  private static once<T>(key: string, task: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key) as Promise<T> | undefined;
    if (existing) return existing;
    const promise = task().finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }

  /**
   * The catalogue, refreshed at most daily unless forced. A copy that could
   * not be refreshed is kept; null when there is none or it is unreadable.
   */
  public static getCatalogue(force = false): Promise<RenoDxCatalogue | null> {
    return this.once("catalogue", async () => {
      const cached = await readJson<CatalogueCache>(getCataloguePath());
      const fresh =
        cached && Date.now() - cached.fetchedAt < CATALOGUE_INTERVAL_MS;

      let text = cached?.text ?? null;
      let fetchedAt = cached?.fetchedAt ?? 0;

      if (!fresh || force) {
        try {
          const response = await axios.get<string>(RENODX_INDEX_URL, {
            timeout: REQUEST_TIMEOUT_MS,
            responseType: "text",
            transformResponse: (data: string) => data,
          });
          if (parseRenoDxIndex(response.data)) {
            text = response.data;
            fetchedAt = Date.now();
            await writeJson(getCataloguePath(), { fetchedAt, text });
          } else {
            logger.warn("[RenoDX] The games index is not in a known format");
          }
        } catch (error) {
          logger.warn("[RenoDX] Could not refresh the games index", error);
        }
      }

      const games = text ? parseRenoDxIndex(text) : null;
      return games ? { games, fetchedAt } : null;
    });
  }

  private static getArtifactDirectory(artifact: RenoDxArtifact) {
    return path.join(getAddOnsDirectory(), artifact.name);
  }

  /** Downloaded builds of an add-on, oldest first. */
  public static async getCachedVersions(artifact: RenoDxArtifact) {
    return (await listDirectories(this.getArtifactDirectory(artifact))).sort();
  }

  /** The add-on's current build, downloaded unless it is cached already. */
  public static ensureAddOn(
    artifact: RenoDxArtifact
  ): Promise<{ version: string; file: string }> {
    return this.once(`addon:${artifact.name}`, async () => {
      const directory = this.getArtifactDirectory(artifact);

      // Installing into many games should not download the same build each time.
      const remote = await this.getRemoteVersion(artifact);
      if (remote) {
        const file = path.join(directory, remote, artifact.name);
        if (
          await fs.promises.access(file).then(
            () => true,
            () => false
          )
        ) {
          return { version: remote, file };
        }
      }

      const partial = path.join(directory, `${randomUUID()}.partial`);
      try {
        const { lastModified } = await downloadToFile(
          artifact.url,
          partial,
          () => undefined
        );
        const key = toVersionKey(lastModified, partial);
        const file = path.join(directory, key, artifact.name);
        await fs.promises.mkdir(path.dirname(file), { recursive: true });
        await fs.promises.rename(partial, file);
        await this.prune(artifact, key);
        this.remoteVersions.delete(artifact.name);
        return { version: key, file };
      } finally {
        await fs.promises.rm(partial, { force: true });
      }
    });
  }

  /**
   * The version the server has now, from a HEAD request, without
   * downloading. Null when it cannot be told. Remembered for a while, since
   * the options page asks every time it opens.
   */
  public static async getRemoteVersion(artifact: RenoDxArtifact) {
    const remembered = this.remoteVersions.get(artifact.name);
    if (remembered && Date.now() - remembered.checkedAt < REMOTE_VERSION_MS) {
      return remembered.version;
    }

    let version: string | null = null;
    try {
      const response = await axios.head(artifact.url, {
        timeout: REQUEST_TIMEOUT_MS,
        headers: { "User-Agent": "HydraLauncher" },
      });
      const lastModified = response.headers["last-modified"];
      const date = lastModified ? new Date(lastModified) : null;
      version =
        date && !Number.isNaN(date.getTime())
          ? date.toISOString().replaceAll(":", "-")
          : null;
    } catch {
      // Offline or rate limited: no news is not an update.
    }

    this.remoteVersions.set(artifact.name, { version, checkedAt: Date.now() });
    return version;
  }

  private static async prune(artifact: RenoDxArtifact, keep: string) {
    const versions = await this.getCachedVersions(artifact);
    for (const version of versions.slice(0, -KEPT_ADD_ON_VERSIONS)) {
      if (version === keep) continue;
      await fs.promises.rm(
        path.join(this.getArtifactDirectory(artifact), version),
        { recursive: true, force: true }
      );
    }
  }

  public static getCacheSize() {
    return getDirectorySize(getAddOnsDirectory());
  }

  public static async clearCache() {
    await fs.promises.rm(getAddOnsDirectory(), {
      recursive: true,
      force: true,
    });
  }
}
