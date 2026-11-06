import { getSteamLibraryFolders } from "../steam";
import type { SteamAppInstallState } from "@types";
import { findSteamAppInstallState } from "./steam-installation-core";
import { requestSteamInstallRefresh } from "./steam-install-watcher";

/** Steam's own view of an install, read from its app manifest. */
export const getSteamInstallState = async (
  steamAppId: string
): Promise<SteamAppInstallState> => {
  const state = await findSteamAppInstallState(
    steamAppId,
    await getSteamLibraryFolders().catch(() => [])
  );

  // The watcher normally gets there first; this covers a missed file event.
  if (state.state === "installed") requestSteamInstallRefresh(steamAppId);

  return state;
};
