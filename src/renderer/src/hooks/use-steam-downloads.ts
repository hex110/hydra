import { useEffect, useState } from "react";
import type { SteamDownload } from "@types";
import { logger } from "@renderer/logger";

/** Installs Steam is doing for library games, pushed from the main process. */
export function useSteamDownloads() {
  const [downloads, setDownloads] = useState<SteamDownload[]>([]);

  useEffect(() => {
    window.electron
      .getSteamDownloads()
      .then(setDownloads)
      .catch((error) => logger.error("Failed to load Steam downloads", error));
    return window.electron.onSteamDownloadsChanged(setDownloads);
  }, []);

  return downloads;
}

export function useSteamDownload(appId: string | null) {
  const downloads = useSteamDownloads();
  return appId
    ? (downloads.find((download) => download.appId === appId) ?? null)
    : null;
}
