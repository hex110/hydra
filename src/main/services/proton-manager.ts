import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import axios from "axios";
import { db, gamesSublevel, levelKeys } from "@main/level";
import { PROTON_FLAVORS, compareProtonNamesNewestFirst } from "@shared";
import type {
  ManagedProtonBuild,
  ProtonFlavor,
  ProtonFlavorOverview,
  ProtonInstallProgress,
  ProtonRelease,
  UserPreferences,
} from "@types";
import { downloadToFile } from "./download-to-file";
import { logger } from "./logger";
import { SystemPath } from "./system-path";
import { WindowManager } from "./window-manager";

const RELEASE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 30_000;

const REPOSITORIES: Record<ProtonFlavor, string> = {
  "ge-proton": "GloriousEggroll/proton-ge-custom",
  "proton-cachyos": "CachyOS/proton-cachyos",
};

interface GitHubRelease {
  tag_name: string;
  published_at: string;
  draft: boolean;
  prerelease: boolean;
  assets: { name: string; browser_download_url: string; size: number }[];
}

interface ManagerState {
  installed: ManagedProtonBuild[];
  releases: Partial<
    Record<
      ProtonFlavor,
      { checkedAt: number; releases: ProtonRelease[]; error: string | null }
    >
  >;
}

const getStatePath = () =>
  path.join(SystemPath.getPath("userData"), "proton-manager.json");

/** Steam's per-user folder for extra Proton builds; umu-run and Steam both list it. */
export const getCompatibilityToolsDirectory = () =>
  path.join(
    SystemPath.getPath("home"),
    ".local",
    "share",
    "Steam",
    "compatibilitytools.d"
  );

const supportsX86_64V3 = (() => {
  let cached: boolean | null = null;
  return () => {
    if (cached !== null) return cached;
    try {
      const flags = fs.readFileSync("/proc/cpuinfo", "utf8");
      cached = ["avx2", "bmi2", "fma", "movbe"].every((flag) =>
        new RegExp(`\\b${flag}\\b`).test(flags)
      );
    } catch {
      cached = false;
    }
    return cached;
  };
})();

/** The x86_64 archive of a release; Proton-CachyOS's v3 build when the CPU supports it. */
const pickAsset = (flavor: ProtonFlavor, release: GitHubRelease) => {
  const archives = release.assets.filter((asset) =>
    /\.tar\.(gz|xz)$/.test(asset.name)
  );
  if (flavor === "ge-proton") {
    return (
      archives.find((asset) => /-x86_64\.tar\.gz$/.test(asset.name)) ??
      archives.find((asset) => /^GE-Proton[\d-]+\.tar\.gz$/.test(asset.name))
    );
  }
  const v3 = archives.find((asset) => /-x86_64_v3\.tar\.xz$/.test(asset.name));
  const generic = archives.find((asset) =>
    /-x86_64\.tar\.xz$/.test(asset.name)
  );
  return supportsX86_64V3() ? (v3 ?? generic) : (generic ?? v3);
};

const toRelease = (
  flavor: ProtonFlavor,
  release: GitHubRelease
): ProtonRelease | null => {
  const asset = pickAsset(flavor, release);
  if (!asset) return null;
  const directoryName = asset.name.replace(/\.tar\.(gz|xz)$/, "");
  const checksum = release.assets.find(
    (item) => item.name === `${directoryName}.sha512sum`
  );
  return {
    flavor,
    tag: release.tag_name,
    publishedAt: release.published_at,
    directoryName,
    downloadUrl: asset.browser_download_url,
    checksumUrl: checksum?.browser_download_url ?? null,
    sizeInBytes: asset.size,
  };
};

const sha512File = (filePath: string) =>
  new Promise<string>((resolve, reject) => {
    const hash = createHash("sha512");
    fs.createReadStream(filePath)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", () => resolve(hash.digest("hex")));
  });

const extractArchive = (archivePath: string, destination: string) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn("tar", ["-xf", archivePath, "-C", destination], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += String(chunk)));
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(stderr.trim() || `tar exited with ${code}`))
    );
  });

/**
 * Downloads GE-Proton and Proton-CachyOS releases into Steam's
 * `compatibilitytools.d`, keeps track of the builds it installed and can keep
 * each flavor up to date.
 */
export class ProtonManager {
  private static readonly installs = new Map<string, Promise<string>>();

  private static async readState(): Promise<ManagerState> {
    try {
      const state = JSON.parse(
        await fs.promises.readFile(getStatePath(), "utf8")
      ) as ManagerState;
      return {
        installed: state.installed ?? [],
        releases: state.releases ?? {},
      };
    } catch {
      return { installed: [], releases: {} };
    }
  }

  private static async writeState(state: ManagerState) {
    const temporaryPath = `${getStatePath()}.${randomUUID()}.tmp`;
    await fs.promises.writeFile(temporaryPath, JSON.stringify(state, null, 2));
    await fs.promises.rename(temporaryPath, getStatePath());
  }

  private static async getPreferences() {
    return db
      .get<string, UserPreferences | null>(levelKeys.userPreferences, {
        valueEncoding: "json",
      })
      .catch(() => null);
  }

  /** Releases of a flavor, newest first; checked at most every six hours unless forced. */
  public static async getReleases(flavor: ProtonFlavor, force = false) {
    const state = await this.readState();
    const cached = state.releases[flavor];
    if (
      !force &&
      cached &&
      Date.now() - cached.checkedAt < RELEASE_CHECK_INTERVAL_MS
    ) {
      return cached;
    }

    try {
      const response = await axios.get<GitHubRelease[]>(
        `https://api.github.com/repos/${REPOSITORIES[flavor]}/releases`,
        {
          params: { per_page: 15 },
          timeout: REQUEST_TIMEOUT_MS,
          headers: { Accept: "application/vnd.github+json" },
        }
      );
      const releases = response.data
        .filter((release) => !release.draft && !release.prerelease)
        .map((release) => toRelease(flavor, release))
        .filter((release): release is ProtonRelease => release !== null);

      const entry = { checkedAt: Date.now(), releases, error: null };
      const latest = await this.readState();
      latest.releases[flavor] = entry;
      await this.writeState(latest);
      return entry;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn("[ProtonManager] Could not list releases", {
        flavor,
        error: message,
      });
      return {
        checkedAt: cached?.checkedAt ?? 0,
        releases: cached?.releases ?? [],
        error: message,
      };
    }
  }

  /** Managed builds whose folder still exists. */
  public static async getInstalled(): Promise<ManagedProtonBuild[]> {
    const state = await this.readState();
    return state.installed.filter((build) => fs.existsSync(build.path));
  }

  public static async getOverview(force = false) {
    const preferences = await this.getPreferences();
    const installed = await this.getInstalled();
    const overviews: ProtonFlavorOverview[] = [];

    for (const flavor of PROTON_FLAVORS) {
      const { releases, checkedAt, error } = await this.getReleases(
        flavor,
        force
      );
      overviews.push({
        flavor,
        latest: releases[0] ?? null,
        releases,
        installed: installed
          .filter((build) => build.flavor === flavor)
          .sort((a, b) =>
            compareProtonNamesNewestFirst(
              path.basename(a.path),
              path.basename(b.path)
            )
          ),
        autoUpdate: preferences?.protonAutoUpdate?.includes(flavor) ?? false,
        checkedAt: checkedAt ? new Date(checkedAt).toISOString() : null,
        error,
      });
    }

    return overviews;
  }

  private static sendProgress(progress: ProtonInstallProgress) {
    WindowManager.sendToAppWindows("on-proton-install-progress", progress);
  }

  /** Installs a release (the newest when `tag` is omitted) and returns its folder. */
  public static install(flavor: ProtonFlavor, tag?: string): Promise<string> {
    const key = `${flavor}:${tag ?? "latest"}`;
    const running = this.installs.get(key);
    if (running) return running;

    const install = this.runInstall(flavor, tag).finally(() =>
      this.installs.delete(key)
    );
    this.installs.set(key, install);
    return install;
  }

  private static async runInstall(flavor: ProtonFlavor, tag?: string) {
    const { releases } = await this.getReleases(flavor, !tag);
    const release = tag
      ? releases.find((item) => item.tag === tag)
      : releases[0];
    if (!release) throw new Error(`No ${flavor} release ${tag ?? ""} found`);

    const root = getCompatibilityToolsDirectory();
    const target = path.join(root, release.directoryName);
    const progress = (
      stage: ProtonInstallProgress["stage"],
      value: number,
      error?: string
    ) =>
      this.sendProgress({
        flavor,
        tag: release.tag,
        stage,
        progress: value,
        ...(error ? { error } : {}),
      });

    if (!fs.existsSync(target)) {
      await fs.promises.mkdir(root, { recursive: true });
      const extension = release.downloadUrl.endsWith(".tar.xz")
        ? ".tar.xz"
        : ".tar.gz";
      const archivePath = path.join(
        root,
        `.hydra-${release.directoryName}${extension}`
      );
      const stagingPath = path.join(
        root,
        `.hydra-${release.directoryName}-${randomUUID()}`
      );

      try {
        logger.info("[ProtonManager] Downloading", release);
        progress("downloading", 0);
        await downloadToFile(release.downloadUrl, archivePath, (loaded) =>
          progress(
            "downloading",
            release.sizeInBytes ? loaded / release.sizeInBytes : 0
          )
        );

        if (release.checksumUrl) {
          progress("verifying", 1);
          const { data } = await axios.get<string>(release.checksumUrl, {
            responseType: "text",
            timeout: REQUEST_TIMEOUT_MS,
          });
          const expected = String(data).trim().split(/\s+/)[0]?.toLowerCase();
          const actual = await sha512File(archivePath);
          if (expected && expected !== actual) {
            throw new Error("The download does not match its checksum");
          }
        }

        progress("extracting", 1);
        await fs.promises.mkdir(stagingPath, { recursive: true });
        await extractArchive(archivePath, stagingPath);
        const extracted = path.join(stagingPath, release.directoryName);
        if (!fs.existsSync(path.join(extracted, "proton"))) {
          throw new Error("The archive does not contain a Proton build");
        }
        await fs.promises.rename(extracted, target);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("[ProtonManager] Install failed", {
          flavor,
          tag: release.tag,
          error: message,
        });
        progress("failed", 0, message);
        throw error;
      } finally {
        await fs.promises.rm(archivePath, { force: true });
        await fs.promises.rm(stagingPath, { recursive: true, force: true });
      }
    }

    const state = await this.readState();
    state.installed = [
      ...state.installed.filter((build) => build.path !== target),
      {
        flavor,
        tag: release.tag,
        path: target,
        installedAt: new Date().toISOString(),
      },
    ];
    await this.writeState(state);

    progress("done", 1);
    logger.info("[ProtonManager] Installed", { flavor, path: target });
    return target;
  }

  /** How many games pick this build, and whether it is the default. */
  public static async getUsage(protonPath: string) {
    const games = (await gamesSublevel.values().all()).filter(
      (game) => !game.isDeleted && game.protonPath === protonPath
    );
    const preferences = await this.getPreferences();
    return {
      games: games.map((game) => game.title),
      isDefault: preferences?.defaultProtonPath === protonPath,
    };
  }

  /** Deletes a build Hydra installed. */
  public static async remove(protonPath: string) {
    const state = await this.readState();
    const build = state.installed.find((item) => item.path === protonPath);
    if (!build) throw new Error("Hydra did not install this Proton build");
    if (path.dirname(build.path) !== getCompatibilityToolsDirectory()) {
      throw new Error("The build is not in compatibilitytools.d");
    }

    await fs.promises.rm(build.path, { recursive: true, force: true });
    state.installed = state.installed.filter((item) => item !== build);
    await this.writeState(state);
    logger.info("[ProtonManager] Removed", { path: build.path });
  }

  /**
   * Installs the newest release of every flavor set to update automatically.
   * When the default Proton was an older build of that flavor, the new build
   * becomes the default; games that picked a build keep it.
   */
  public static async updateAutomatically() {
    const preferences = await this.getPreferences();
    const flavors = preferences?.protonAutoUpdate ?? [];
    if (flavors.length === 0 || process.platform !== "linux") return;

    for (const flavor of flavors) {
      try {
        const installed = await this.getInstalled();
        const { releases } = await this.getReleases(flavor, true);
        const latest = releases[0];
        if (!latest) continue;
        if (installed.some((build) => build.tag === latest.tag)) continue;

        const newPath = await this.install(flavor, latest.tag);
        const current = await this.getPreferences();
        const defaultBuild = installed.find(
          (build) => build.path === current?.defaultProtonPath
        );
        if (defaultBuild?.flavor === flavor) {
          await db.put<string, UserPreferences>(
            levelKeys.userPreferences,
            { ...current, defaultProtonPath: newPath },
            { valueEncoding: "json" }
          );
          logger.info("[ProtonManager] Moved the default to the new build", {
            path: newPath,
          });
        }
      } catch (error) {
        logger.warn("[ProtonManager] Automatic update failed", {
          flavor,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}
