import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import axios from "axios";
import type { OptiScalerChannel, OptiScalerCompatibilityEntry } from "@types";
import {
  compareOptiScalerVersions,
  parseOptiScalerCompatibilityList,
} from "@shared";
import { SevenZip } from "@main/services/7zip";
import { downloadToFile } from "@main/services/download-to-file";
import { logger } from "@main/services/logger";
import { SystemPath } from "@main/services/system-path";
import { findReleaseRoot } from "./game-files";

const RELEASE_REPOSITORIES: Record<OptiScalerChannel, string> = {
  stable: "optiscaler/OptiScaler",
  nightly: "optiscaler/OptiScaler-nightly",
};
const OPTIPATCHER_REPOSITORY = "optiscaler/OptiPatcher";
const COMPATIBILITY_LIST_URL =
  "https://raw.githubusercontent.com/wiki/optiscaler/OptiScaler/Compatibility-List.md";

const RELEASE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const COMPATIBILITY_LIST_INTERVAL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;

interface ReleaseInfo {
  version: string;
  downloadUrl: string;
}

interface CheckedRelease extends ReleaseInfo {
  checkedAt: number;
}

interface AssetsState {
  releases?: Partial<Record<OptiScalerChannel, CheckedRelease>>;
  optiPatcher?: ReleaseInfo & { checkedAt: number };
}

interface CompatibilityCache {
  fetchedAt: number;
  entries: OptiScalerCompatibilityEntry[];
}

interface GitHubRelease {
  tag_name: string;
  draft: boolean;
  assets: { name: string; browser_download_url: string }[];
}

const getRootDirectory = () =>
  path.join(SystemPath.getPath("userData"), "optiscaler");
const getStatePath = () => path.join(getRootDirectory(), "state.json");
const getCompatibilityPath = () =>
  path.join(getRootDirectory(), "compatibility-list.json");
const getReleasesDirectory = (channel: OptiScalerChannel) =>
  path.join(getRootDirectory(), "releases", channel);
const getOptiPatcherDirectory = () =>
  path.join(getRootDirectory(), "optipatcher");

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

const fetchLatestRelease = async (
  repository: string,
  assetPattern: RegExp
): Promise<ReleaseInfo | null> => {
  const response = await axios.get<GitHubRelease[]>(
    `https://api.github.com/repos/${repository}/releases`,
    {
      params: { per_page: 10 },
      timeout: REQUEST_TIMEOUT_MS,
      headers: { Accept: "application/vnd.github+json" },
    }
  );

  for (const release of response.data) {
    if (release.draft) continue;
    const asset = release.assets.find((item) => assetPattern.test(item.name));
    if (asset) {
      return {
        version: release.tag_name.replace(/^v/i, ""),
        downloadUrl: asset.browser_download_url,
      };
    }
  }

  return null;
};

const listDirectories = async (directory: string) =>
  (
    await fs.promises
      .readdir(directory, { withFileTypes: true })
      .catch(() => [] as fs.Dirent[])
  )
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name);

const getDirectorySize = async (directory: string): Promise<number> => {
  const entries = await fs.promises
    .readdir(directory, { withFileTypes: true })
    .catch(() => [] as fs.Dirent[]);
  let size = 0;
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) size += await getDirectorySize(entryPath);
    else
      size += (await fs.promises.stat(entryPath).catch(() => null))?.size ?? 0;
  }
  return size;
};

/**
 * Downloads and caches OptiScaler releases, OptiPatcher and the OptiScaler
 * wiki's compatibility list under `<userData>/optiscaler`.
 */
export class OptiScalerAssets {
  private static readonly inflight = new Map<string, Promise<unknown>>();

  private static once<T>(key: string, task: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key) as Promise<T> | undefined;
    if (existing) return existing;
    const promise = task().finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }

  private static readState() {
    return readJson<AssetsState>(getStatePath()).then((state) => state ?? {});
  }

  /** The newest release of a channel, checked at most every six hours unless forced. */
  public static getLatestRelease(
    channel: OptiScalerChannel,
    force = false
  ): Promise<CheckedRelease | null> {
    return this.once(`latest:${channel}`, async () => {
      const state = await this.readState();
      const cached = state.releases?.[channel];
      if (
        !force &&
        cached &&
        Date.now() - cached.checkedAt < RELEASE_CHECK_INTERVAL_MS
      ) {
        return cached;
      }

      try {
        const latest = await fetchLatestRelease(
          RELEASE_REPOSITORIES[channel],
          /\.7z$/i
        );
        if (!latest) return cached ?? null;

        const checked = { ...latest, checkedAt: Date.now() };
        await writeJson(getStatePath(), {
          ...state,
          releases: { ...state.releases, [channel]: checked },
        });
        return checked;
      } catch (error) {
        logger.warn("[OptiScaler] Failed to check for releases", {
          channel,
          error: error instanceof Error ? error.message : String(error),
        });
        return cached ?? null;
      }
    });
  }

  public static async getCachedVersions(channel: OptiScalerChannel) {
    return (await listDirectories(getReleasesDirectory(channel))).sort(
      compareOptiScalerVersions
    );
  }

  /** Returns the newest release of a channel on disk, downloading it when needed. */
  public static ensureRelease(
    channel: OptiScalerChannel
  ): Promise<{ version: string; directory: string }> {
    return this.once(`release:${channel}`, async () => {
      const latest = await this.getLatestRelease(channel);
      const cachedVersions = await this.getCachedVersions(channel);

      const version = latest?.version ?? cachedVersions.at(-1);
      if (!version) {
        throw new Error(
          "OptiScaler is not downloaded and GitHub is unreachable"
        );
      }

      const versionDirectory = path.join(
        getReleasesDirectory(channel),
        version
      );
      if (!cachedVersions.includes(version) && latest) {
        await this.downloadRelease(latest, versionDirectory);
      }

      const directory = await findReleaseRoot(versionDirectory);
      if (!directory) {
        throw new Error(`OptiScaler ${version} has no OptiScaler.dll`);
      }

      return { version, directory };
    });
  }

  private static async downloadRelease(
    release: ReleaseInfo,
    versionDirectory: string
  ) {
    const stagingDirectory = `${versionDirectory}.${randomUUID()}.partial`;
    const archivePath = `${stagingDirectory}.7z`;

    logger.info("[OptiScaler] Downloading release", release);

    try {
      await downloadToFile(release.downloadUrl, archivePath, () => undefined);
      const result = await SevenZip.extractFile({
        filePath: archivePath,
        outputPath: stagingDirectory,
      });
      if (!result.success || !(await findReleaseRoot(stagingDirectory))) {
        throw new Error(`Could not extract OptiScaler ${release.version}`);
      }

      await fs.promises.rm(versionDirectory, { recursive: true, force: true });
      await fs.promises.rename(stagingDirectory, versionDirectory);
    } finally {
      await fs.promises.rm(archivePath, { force: true });
      await fs.promises.rm(stagingDirectory, { recursive: true, force: true });
    }
  }

  /** The newest OptiPatcher plugin, or null when it cannot be obtained. */
  public static ensureOptiPatcher(): Promise<{
    version: string;
    path: string;
  } | null> {
    return this.once("optipatcher", async () => {
      const state = await this.readState();
      let latest: ReleaseInfo | null = state.optiPatcher ?? null;

      if (
        !state.optiPatcher ||
        Date.now() - state.optiPatcher.checkedAt >= RELEASE_CHECK_INTERVAL_MS
      ) {
        try {
          // Tagged releases only; "rolling" has no version in its asset name.
          latest =
            (await fetchLatestRelease(
              OPTIPATCHER_REPOSITORY,
              /^OptiPatcher_v.+\.asi$/i
            )) ?? latest;
          if (latest) {
            await writeJson(getStatePath(), {
              ...state,
              optiPatcher: { ...latest, checkedAt: Date.now() },
            });
          }
        } catch (error) {
          logger.warn("[OptiScaler] Failed to check OptiPatcher releases", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const cached = (
        await fs.promises.readdir(getOptiPatcherDirectory()).catch(() => [])
      )
        .filter((name) => name.endsWith(".asi"))
        .sort((a, b) => compareOptiScalerVersions(a, b));

      if (latest) {
        const fileName = `${latest.version}.asi`;
        const filePath = path.join(getOptiPatcherDirectory(), fileName);
        if (!cached.includes(fileName)) {
          try {
            await downloadToFile(
              latest.downloadUrl,
              `${filePath}.partial`,
              () => undefined
            );
            await fs.promises.rename(`${filePath}.partial`, filePath);
          } catch (error) {
            logger.warn("[OptiScaler] Failed to download OptiPatcher", {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
        if (fs.existsSync(filePath)) {
          return { version: latest.version, path: filePath };
        }
      }

      const fallback = cached.at(-1);
      return fallback
        ? {
            version: fallback.replace(/\.asi$/, ""),
            path: path.join(getOptiPatcherDirectory(), fallback),
          }
        : null;
    });
  }

  public static async getCompatibilityListInfo() {
    const cache = await readJson<CompatibilityCache>(getCompatibilityPath());
    return {
      fetchedAt: cache ? new Date(cache.fetchedAt).toISOString() : null,
      size: cache?.entries.length ?? 0,
    };
  }

  /** The wiki's compatibility list, refreshed daily; stale data beats none. */
  public static getCompatibilityList(
    force = false
  ): Promise<OptiScalerCompatibilityEntry[]> {
    return this.once("compatibility", async () => {
      const cache = await readJson<CompatibilityCache>(getCompatibilityPath());
      if (
        !force &&
        cache &&
        Date.now() - cache.fetchedAt < COMPATIBILITY_LIST_INTERVAL_MS
      ) {
        return cache.entries;
      }

      try {
        const response = await axios.get<string>(COMPATIBILITY_LIST_URL, {
          responseType: "text",
          timeout: REQUEST_TIMEOUT_MS,
        });
        const entries = parseOptiScalerCompatibilityList(response.data);
        if (entries.length === 0) {
          throw new Error("The compatibility list page has no table");
        }
        await writeJson(getCompatibilityPath(), {
          fetchedAt: Date.now(),
          entries,
        } satisfies CompatibilityCache);
        return entries;
      } catch (error) {
        logger.warn("[OptiScaler] Failed to refresh the compatibility list", {
          error: error instanceof Error ? error.message : String(error),
        });
        return cache?.entries ?? [];
      }
    });
  }

  public static async getCacheSize() {
    return getDirectorySize(path.join(getRootDirectory(), "releases"));
  }

  /** Deletes downloaded releases; games keep their own copies. */
  public static async clearCache() {
    await fs.promises.rm(path.join(getRootDirectory(), "releases"), {
      recursive: true,
      force: true,
    });
  }
}
