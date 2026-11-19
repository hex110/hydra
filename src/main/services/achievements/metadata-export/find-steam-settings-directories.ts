import path from "node:path";

import { isUnsafePath } from "../../../events/helpers/find-game-root.js";
import {
  STEAM_SETTINGS_DIR_NAME,
  collectEmulatorDirectories,
  findEntriesBreadthFirst,
  resolveContainedDirectory,
  resolveContainmentRoot,
} from "../game-directory.js";

const COLD_CLIENT_DIR_NAME = "coldclient";

const STEAM_SETTINGS_RELATIVE_PATHS = [
  [STEAM_SETTINGS_DIR_NAME],
  [COLD_CLIENT_DIR_NAME, STEAM_SETTINGS_DIR_NAME],
];

export const findSteamSettingsDirectories = async (executablePath: string) => {
  if (isUnsafePath(path.dirname(executablePath))) return [];

  const containmentRoot = await resolveContainmentRoot(executablePath);

  if (!containmentRoot) return [];

  const emulatorDirectories = await collectEmulatorDirectories(executablePath);

  const directories = new Set<string>();

  await Promise.all(
    emulatorDirectories.flatMap((emulatorDirectory) =>
      STEAM_SETTINGS_RELATIVE_PATHS.map(async (segments) => {
        const candidate = path.join(emulatorDirectory, ...segments);
        const resolved = await resolveContainedDirectory(
          containmentRoot,
          candidate
        );

        if (resolved) directories.add(resolved);
      })
    )
  );

  if (directories.size) return [...directories];

  for (const directory of await findEntriesBreadthFirst(
    containmentRoot,
    (entry) =>
      entry.isDirectory() &&
      entry.name.toLowerCase() === STEAM_SETTINGS_DIR_NAME
  )) {
    const resolved = await resolveContainedDirectory(
      containmentRoot,
      directory
    );

    if (resolved) directories.add(resolved);
  }

  return [...directories];
};
