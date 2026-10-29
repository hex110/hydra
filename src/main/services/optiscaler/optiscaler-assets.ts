import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import axios from "axios";
import type {
  OptiScalerChannel,
  OptiScalerCompatibilityEntry,
  OptiScalerProxyDll,
} from "@types";
import {
  compareOptiScalerVersions,
  parseOptiScalerCompatibilityList,
  parseOptiScalerWikiProxyDlls,
} from "@shared";
import { SevenZip } from "@main/services/7zip";
import {
  getDirectorySize,
  listDirectories,
  readJson,
  writeJson,
} from "@main/services/cache-files";
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

const WIKI_PAGES_URL =
  "https://raw.githubusercontent.com/wiki/optiscaler/OptiScaler";
/** The wiki stores game pages as AsciiDoc, older ones as Markdown. */
const WIKI_PAGE_EXTENSIONS = ["asciidoc", "md"];

const RELEASE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const WIKI_PAGE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
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

interface WikiProxyDllCache {
  [slug: string]: { fetchedAt: number; dlls: OptiScalerProxyDll[] };
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
const getWikiProxyDllsPath = () =>
  path.join(getRootDirectory(), "wiki-proxy-dlls.json");
const getReleasesDirectory = (channel: OptiScalerChannel) =>
  path.join(getRootDirectory(), "releases", channel);
const getOptiPatcherDirectory = () =>
  path.join(getRootDirectory(), "optipatcher");

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

  /** A release that is already downloaded, for installing an older version. */
  public static async getCachedRelease(
    channel: OptiScalerChannel,
    version: string
  ): Promise<{ version: string; directory: string }> {
    const directory = await findReleaseRoot(
      path.join(getReleasesDirectory(channel), version)
    );
    if (!directory) throw new Error(`OptiScaler ${version} is not downloaded`);
    return { version, directory };
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

  /**
   * The proxy DLL names the wiki's page for a game lists, best first. Pages are
   * cached for a week, and a failed request falls back to the cached names
   * (or none): the install then picks a name without the wiki's help.
   */
  public static getWikiProxyDlls(slug: string): Promise<OptiScalerProxyDll[]> {
    return this.once(`wiki-proxy-dlls:${slug}`, async () => {
      const cache =
        (await readJson<WikiProxyDllCache>(getWikiProxyDllsPath())) ?? {};
      const cached = cache[slug];
      if (cached && Date.now() - cached.fetchedAt < WIKI_PAGE_INTERVAL_MS) {
        return cached.dlls;
      }

      try {
        const dlls = await this.fetchWikiProxyDlls(slug);
        await this.writeWikiProxyDlls(slug, dlls);
        return dlls;
      } catch (error) {
        logger.warn("[OptiScaler] Failed to read the wiki page for a game", {
          slug,
          error: error instanceof Error ? error.message : String(error),
        });
        return cached?.dlls ?? [];
      }
    });
  }

  /** Empty when the wiki has no page for the slug; throws when it cannot be reached. */
  private static async fetchWikiProxyDlls(slug: string) {
    for (const extension of WIKI_PAGE_EXTENSIONS) {
      try {
        const response = await axios.get<string>(
          `${WIKI_PAGES_URL}/${encodeURI(slug)}.${extension}`,
          { responseType: "text", timeout: REQUEST_TIMEOUT_MS }
        );
        return parseOptiScalerWikiProxyDlls(response.data);
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          continue;
        }
        throw error;
      }
    }
    return [];
  }

  private static wikiProxyDllsWrite: Promise<unknown> = Promise.resolve();

  /** Games are looked up side by side; one at a time keeps the shared file whole. */
  private static writeWikiProxyDlls(slug: string, dlls: OptiScalerProxyDll[]) {
    const write = this.wikiProxyDllsWrite
      .catch(() => undefined)
      .then(async () => {
        const cache =
          (await readJson<WikiProxyDllCache>(getWikiProxyDllsPath())) ?? {};
        cache[slug] = { fetchedAt: Date.now(), dlls };
        await writeJson(getWikiProxyDllsPath(), cache);
      });
    this.wikiProxyDllsWrite = write;
    return write.catch(() => undefined);
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
