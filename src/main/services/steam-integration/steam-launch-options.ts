import path from "node:path";
import type { SteamLaunchOptionInfo } from "@types";
import {
  listSteamLaunchOptions,
  resolvePathIgnoringCase,
  toSteamExecutableSegments,
  type SteamLaunchOption,
} from "./steam-app-info-core";
import { getSteamCompatibilityPrefixPath } from "./steam-installation-core";
import { findSteamManifest } from "./steam-manifest";
import { loadSteamAppInfo } from "./steam-launch-executables";

interface ResolvedSteamLaunchOption extends SteamLaunchOption {
  executablePath: string;
  installDirectory: string;
  compatibilityPrefixPath: string;
}

const resolveOptions = async (
  appId: string
): Promise<ResolvedSteamLaunchOption[]> => {
  const manifest = await findSteamManifest(appId);
  const installDirName = manifest?.content.match(
    /"installdir"\s*"([^"]+)"/i
  )?.[1];
  if (!manifest || !installDirName) return [];

  const installDirectory = path.join(
    manifest.libraryFolder,
    "steamapps",
    "common",
    installDirName
  );
  const appInfo = (await loadSteamAppInfo([appId])).get(appId);
  if (!appInfo) return [];

  const resolved: ResolvedSteamLaunchOption[] = [];

  for (const option of listSteamLaunchOptions(
    appInfo,
    manifest.state.betaKey
  )) {
    const segments = toSteamExecutableSegments(option.executable);
    if (segments.length === 0 || segments.includes("..")) continue;

    const executablePath = await resolvePathIgnoringCase(
      installDirectory,
      segments
    );
    if (!executablePath) continue;

    resolved.push({
      ...option,
      executablePath,
      installDirectory,
      compatibilityPrefixPath: getSteamCompatibilityPrefixPath(
        installDirectory,
        appId
      ),
    });
  }

  // The default may be missing on disk; the first one left stands in for it.
  return resolved.map((option, index) => ({
    ...option,
    isDefault: index === 0,
  }));
};

/** Ways to start a Steam-installed game; empty unless there are several. */
export const getSteamLaunchOptions = async (
  appId: string
): Promise<SteamLaunchOptionInfo[]> => {
  const options = await resolveOptions(appId);
  if (options.length < 2) return [];

  return options.map(({ id, description, executable, type, isDefault }) => ({
    id,
    description,
    executable: path.basename(executable.replaceAll("\\", "/")),
    type,
    isDefault,
  }));
};

export const resolveSteamLaunchOption = async (
  appId: string,
  optionId: string
): Promise<ResolvedSteamLaunchOption | null> =>
  (await resolveOptions(appId)).find((option) => option.id === optionId) ??
  null;
