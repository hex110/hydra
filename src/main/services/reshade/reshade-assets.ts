import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import axios from "axios";
import {
  compareVersions,
  parseLatestReShadeDownload,
  type ReShadeDownload,
} from "@shared";
import { SevenZip } from "@main/services/7zip";
import {
  getDirectorySize,
  listDirectories,
  readJson,
  writeJson,
} from "@main/services/cache-files";
import { logger } from "@main/services/logger";
import { SystemPath } from "@main/services/system-path";

const RESHADE_SITE = "https://reshade.me/";
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 30_000;
const KEPT_VERSIONS = 2;

export const RESHADE_DLLS = ["ReShade64.dll", "ReShade32.dll"] as const;

interface CheckedDownload extends ReShadeDownload {
  checkedAt: number;
}

interface AssetsState {
  latest?: CheckedDownload;
}

const getRootDirectory = () =>
  path.join(SystemPath.getPath("userData"), "reshade");
const getStatePath = () => path.join(getRootDirectory(), "state.json");
const getVersionsDirectory = () => path.join(getRootDirectory(), "versions");

const hasDlls = async (directory: string) => {
  const present = await Promise.all(
    RESHADE_DLLS.map((name) =>
      fs.promises.access(path.join(directory, name)).then(
        () => true,
        () => false
      )
    )
  );
  return present.every(Boolean);
};

/**
 * Downloads ReShade's add-on build from reshade.me and caches its DLLs under
 * `<userData>/reshade`. The installer is a self-extracting archive, so the DLLs
 * come out of it without running anything.
 */
export class ReShadeAssets {
  private static readonly inflight = new Map<string, Promise<unknown>>();

  private static once<T>(key: string, task: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key) as Promise<T> | undefined;
    if (existing) return existing;
    const promise = task().finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }

  /** The newest add-on build, checked at most every six hours unless forced. */
  public static getLatest(force = false): Promise<CheckedDownload | null> {
    return this.once("latest", async () => {
      const state = (await readJson<AssetsState>(getStatePath())) ?? {};
      const cached = state.latest ?? null;
      if (
        cached &&
        !force &&
        Date.now() - cached.checkedAt < CHECK_INTERVAL_MS
      ) {
        return cached;
      }

      try {
        const response = await axios.get<string>(RESHADE_SITE, {
          timeout: REQUEST_TIMEOUT_MS,
          responseType: "text",
        });
        const download = parseLatestReShadeDownload(response.data);
        if (!download) {
          logger.warn("[ReShade] reshade.me links no add-on installer");
          return cached;
        }
        const latest = { ...download, checkedAt: Date.now() };
        await writeJson(getStatePath(), { ...state, latest });
        return latest;
      } catch (error) {
        logger.warn("[ReShade] Could not check for a new version", error);
        return cached;
      }
    });
  }

  public static async getCachedVersions() {
    const versions: string[] = [];
    for (const name of await listDirectories(getVersionsDirectory())) {
      if (await hasDlls(path.join(getVersionsDirectory(), name))) {
        versions.push(name);
      }
    }
    return versions.sort(compareVersions);
  }

  /** The DLLs of `version`, or of the newest build when it is not given. */
  public static ensure(
    version?: string
  ): Promise<{ version: string; directory: string }> {
    return this.once(`ensure:${version ?? "latest"}`, async () => {
      const cached = await this.getCachedVersions();
      const directoryOf = (name: string) => ({
        version: name,
        directory: path.join(getVersionsDirectory(), name),
      });

      const latest = version ? null : await this.getLatest();
      const wanted = version ?? latest?.version ?? cached.at(-1);
      if (!wanted) throw new Error("ReShade is not available");
      if (cached.includes(wanted)) return directoryOf(wanted);

      await this.download(
        latest?.version === wanted
          ? latest
          : {
              version: wanted,
              path: `downloads/ReShade_Setup_${wanted}_Addon.exe`,
            },
        directoryOf(wanted).directory
      );
      await this.prune(wanted);
      return directoryOf(wanted);
    });
  }

  private static async download(release: ReShadeDownload, target: string) {
    const staging = `${target}.${randomUUID()}.partial`;
    const installer = `${staging}.exe`;
    logger.info("[ReShade] Downloading", release);

    try {
      // reshade.me refuses downloads that don't come from its own pages.
      const response = await axios.get<ArrayBuffer>(
        new URL(release.path, RESHADE_SITE).toString(),
        {
          timeout: REQUEST_TIMEOUT_MS * 4,
          responseType: "arraybuffer",
          headers: { Referer: RESHADE_SITE },
        }
      );
      await fs.promises.mkdir(path.dirname(installer), { recursive: true });
      await fs.promises.writeFile(installer, Buffer.from(response.data));

      const result = await SevenZip.extractFile({
        filePath: installer,
        outputPath: staging,
      });
      if (!result.success || !(await hasDlls(staging))) {
        throw new Error(`Could not extract ReShade ${release.version}`);
      }

      await fs.promises.rm(target, { recursive: true, force: true });
      await fs.promises.rename(staging, target);
    } finally {
      await fs.promises.rm(installer, { force: true });
      await fs.promises.rm(staging, { recursive: true, force: true });
    }
  }

  /** Keeps the newest builds, so a bad update can be rolled back. */
  private static async prune(keep: string) {
    const versions = await this.getCachedVersions();
    for (const version of versions.slice(0, -KEPT_VERSIONS)) {
      if (version === keep) continue;
      await fs.promises.rm(path.join(getVersionsDirectory(), version), {
        recursive: true,
        force: true,
      });
    }
  }

  public static getCacheSize() {
    return getDirectorySize(getVersionsDirectory());
  }

  public static async clearCache() {
    await fs.promises.rm(getVersionsDirectory(), {
      recursive: true,
      force: true,
    });
  }
}
