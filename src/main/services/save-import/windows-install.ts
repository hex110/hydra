import fs from "node:fs";
import path from "node:path";

/** Profiles every Windows install has that never hold a user's saves. */
const SYSTEM_PROFILES = new Set([
  "all users",
  "default",
  "default user",
  "defaultapppool",
  "public",
  "wdagutilityaccount",
]);

/** Top-level Windows folders saves can live in, besides user profiles. */
const MIRRORED_ROOT_FOLDERS = [
  "ProgramData",
  "Program Files",
  "Program Files (x86)",
];

export interface WindowsInstall {
  rootPath: string;
  userProfiles: string[];
  steamPath: string | null;
}

const isDirectory = (target: string) =>
  fs.statSync(target, { throwIfNoEntry: false })?.isDirectory() === true;

/** Finds an entry of a directory ignoring case, as Windows paths do. */
const findEntry = (directory: string, name: string) => {
  const lower = name.toLowerCase();
  try {
    return (
      fs
        .readdirSync(directory)
        .find((entry) => entry.toLowerCase() === lower) ?? null
    );
  } catch {
    return null;
  }
};

/**
 * Reads a folder as a Windows drive root: its user profiles (those with an
 * AppData folder) and its Steam install. Null when it is not one.
 */
export const readWindowsInstall = (rootPath: string): WindowsInstall | null => {
  const usersFolder = findEntry(rootPath, "Users");
  if (!usersFolder) return null;

  const usersPath = path.join(rootPath, usersFolder);
  let profiles: string[];
  try {
    profiles = fs.readdirSync(usersPath);
  } catch {
    return null;
  }

  const userProfiles = profiles
    .filter((profile) => !SYSTEM_PROFILES.has(profile.toLowerCase()))
    .filter((profile) => {
      const profilePath = path.join(usersPath, profile);
      return isDirectory(profilePath) && !!findEntry(profilePath, "AppData");
    })
    .sort((a, b) => a.localeCompare(b));
  if (userProfiles.length === 0) return null;

  const steamCandidates = [
    ["Program Files (x86)", "Steam"],
    ["Program Files", "Steam"],
    ["Steam"],
  ];
  const steamPath =
    steamCandidates
      .map((segments) => path.join(rootPath, ...segments))
      .find((candidate) => isDirectory(path.join(candidate, "steamapps"))) ??
    null;

  return { rootPath, userProfiles, steamPath };
};

/** Mount points worth checking for Windows installs. */
export const getWindowsInstallCandidates = (username: string): string[] => {
  const candidates: string[] = [];
  for (const parent of ["/mnt", "/media", path.join("/run/media", username)]) {
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(parent);
    } catch {
      continue;
    }
    for (const entry of entries) candidates.push(path.join(parent, entry));
  }
  return candidates;
};

/**
 * Builds a Wine-prefix-shaped view of a Windows install out of symlinks, so
 * Hydra's save discovery and achievement lookup, which understand Wine
 * prefixes, can read a Windows drive unchanged. The profile is linked under
 * the Linux user name, which is the name Hydra's achievement lookup and
 * Proton's own `users/<name>` link use.
 */
export const buildWindowsInstallMirror = async (
  install: Pick<WindowsInstall, "rootPath">,
  userProfile: string,
  linuxUsername: string,
  mirrorPath: string
) => {
  const usersFolder = findEntry(install.rootPath, "Users");
  if (!usersFolder) throw new Error("Not a Windows drive root");

  await fs.promises.rm(mirrorPath, { recursive: true, force: true });
  const driveC = path.join(mirrorPath, "drive_c");
  const users = path.join(driveC, "users");
  await fs.promises.mkdir(users, { recursive: true });

  const link = (target: string, linkPath: string) =>
    fs.promises.symlink(target, linkPath).catch(() => undefined);

  await link(
    path.join(install.rootPath, usersFolder, userProfile),
    path.join(users, linuxUsername)
  );

  const publicFolder = findEntry(
    path.join(install.rootPath, usersFolder),
    "Public"
  );
  if (publicFolder) {
    await link(
      path.join(install.rootPath, usersFolder, publicFolder),
      path.join(users, "Public")
    );
  }

  for (const folder of MIRRORED_ROOT_FOLDERS) {
    const actual = findEntry(install.rootPath, folder);
    if (actual) {
      await link(
        path.join(install.rootPath, actual),
        path.join(driveC, folder)
      );
    }
  }

  return mirrorPath;
};
