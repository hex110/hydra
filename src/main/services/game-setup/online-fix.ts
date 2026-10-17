import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Proxy DLLs OnlineFix may ship next to the game. dxgi and d3d* are left to
 * Proton's DXVK/VKD3D.
 */
export const ONLINE_FIX_PROXY_DLLS = [
  "winmm",
  "version",
  "winhttp",
  "wininet",
  "dinput8",
  "dsound",
  "xinput1_3",
  "xinput1_4",
  "xinput9_1_0",
];

/** Steam client files OnlineFix loads as the "original steamclient". */
export const STEAM_CLIENT_FILES = [
  "steamclient64.dll",
  "steamclient.dll",
  "GameOverlayRenderer64.dll",
  "tier0_s64.dll",
  "vstdlib_s64.dll",
];

const STEAM_PREFIX_DIRECTORY = path.join(
  "drive_c",
  "Program Files (x86)",
  "Steam"
);

const MARKER_FILES = new Set(["onlinefix.ini", "onlinefix64.dll"]);
const SEARCH_MAX_DEPTH = 6;
const SEARCH_MAX_ENTRIES = 20_000;

export interface OnlineFixDetection {
  /** The folder holding OnlineFix's files. */
  directory: string;
  /** Proxy DLLs (without ".dll") found there, which Wine must load natively. */
  proxyDlls: string[];
}

/** Finds an OnlineFix install inside a game folder, nearest to the top first. */
export const detectOnlineFix = async (
  gameRoot: string
): Promise<OnlineFixDetection | null> => {
  let visited = 0;
  let level = [gameRoot];

  for (let depth = 0; depth <= SEARCH_MAX_DEPTH && level.length > 0; depth++) {
    const next: string[] = [];

    for (const directory of level) {
      const entries = await fs.promises
        .readdir(directory, { withFileTypes: true })
        .catch(() => [] as fs.Dirent[]);
      visited += entries.length;

      const files = new Set(
        entries
          .filter((entry) => entry.isFile())
          .map((entry) => entry.name.toLowerCase())
      );

      if ([...MARKER_FILES].some((marker) => files.has(marker))) {
        return {
          directory,
          proxyDlls: ONLINE_FIX_PROXY_DLLS.filter((dll) =>
            files.has(`${dll}.dll`)
          ),
        };
      }

      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith(".")) {
          next.push(path.join(directory, entry.name));
        }
      }
    }

    if (visited > SEARCH_MAX_ENTRIES) break;
    level = next;
  }

  return null;
};

/**
 * Folders that may hold Steam's client files: Linux Steam installs, Windows
 * Steam installs on mounted drives (the only place tier0/vstdlib exist), and
 * other Wine prefixes that already received them.
 */
export const getSteamClientSourceDirectories = async (
  prefixesDirectories: string[]
): Promise<string[]> => {
  const home = os.homedir();
  const candidates = [
    path.join(home, ".local", "share", "Steam"),
    path.join(home, ".steam", "steam"),
    path.join(
      home,
      ".var",
      "app",
      "com.valvesoftware.Steam",
      ".local",
      "share",
      "Steam"
    ),
  ];

  const user = os.userInfo().username;
  const mountRoots = ["/mnt", "/media", path.join("/run/media", user)];
  for (const root of mountRoots) {
    const drives = await fs.promises.readdir(root).catch(() => [] as string[]);
    for (const drive of drives) {
      candidates.push(
        path.join(root, drive, "Steam"),
        path.join(root, drive, "Program Files (x86)", "Steam"),
        path.join(root, drive, "Program Files", "Steam")
      );
    }
  }

  for (const prefixesDirectory of prefixesDirectories) {
    const prefixes = await fs.promises
      .readdir(prefixesDirectory)
      .catch(() => [] as string[]);
    candidates.push(
      ...prefixes.map((prefix) =>
        path.join(prefixesDirectory, prefix, STEAM_PREFIX_DIRECTORY)
      )
    );
  }

  return candidates;
};

export interface SteamClientCopyResult {
  copied: string[];
  missing: string[];
}

/** Copies Steam's client files into a prefix, keeping any already there. */
export const copySteamClientFiles = async (
  winePrefixPath: string,
  sourceDirectories: string[]
): Promise<SteamClientCopyResult> => {
  const destination = path.join(winePrefixPath, STEAM_PREFIX_DIRECTORY);
  const result: SteamClientCopyResult = { copied: [], missing: [] };

  for (const name of STEAM_CLIENT_FILES) {
    const target = path.join(destination, name);
    if (fs.existsSync(target)) continue;

    const source = sourceDirectories
      .map((directory) => path.join(directory, name))
      .find(
        (candidate) =>
          path.resolve(candidate) !== path.resolve(target) &&
          fs.statSync(candidate, { throwIfNoEntry: false })?.isFile()
      );

    if (!source) {
      result.missing.push(name);
      continue;
    }

    await fs.promises.mkdir(destination, { recursive: true });
    await fs.promises.copyFile(source, target);
    result.copied.push(name);
  }

  return result;
};
