import fs from "node:fs";
import path from "node:path";
import { getSteamLibraryFolders } from "../steam";
import {
  parseSteamManifestState,
  type SteamManifestState,
} from "./steam-manifest-core";

export interface SteamManifest {
  path: string;
  libraryFolder: string;
  content: string;
  state: SteamManifestState;
}

/** The app's manifest in whichever Steam library holds it. */
export const findSteamManifest = async (
  appId: string
): Promise<SteamManifest | null> => {
  if (!/^\d+$/.test(appId)) return null;

  for (const libraryFolder of await getSteamLibraryFolders().catch(() => [])) {
    const manifestPath = path.join(
      libraryFolder,
      "steamapps",
      `appmanifest_${appId}.acf`
    );
    const content = await fs.promises
      .readFile(manifestPath, "utf8")
      .catch(() => null);
    if (content === null) continue;

    const state = parseSteamManifestState(content);
    if (state.appId === appId) {
      return { path: manifestPath, libraryFolder, content, state };
    }
  }

  return null;
};
