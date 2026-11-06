import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { formatBytes, formatBytesToMbps } from "@shared";
import type { SteamDownload } from "@types";

import { useAppSelector } from "@renderer/hooks";

/** One line for a Steam install: what Steam is doing, how far, how fast. */
export function useSteamDownloadText() {
  const { t } = useTranslation("downloads");
  const inMegabytes = useAppSelector(
    (state) => state.userPreferences.value?.showDownloadSpeedInMegabytes
  );

  return useCallback(
    (download: SteamDownload) => {
      if (download.status === "waiting") return t("steam_download_waiting");
      if (download.status === "finishing") {
        return t("steam_download_finishing");
      }

      const parts = [t(`steam_download_${download.status}`)];

      if (download.progress !== null) {
        parts.push(`${Math.floor(download.progress * 100)}%`);
      } else if (download.status === "downloading") {
        parts[0] = t("steam_download_preparing");
      }

      if (download.bytesDone !== null && download.bytesTotal !== null) {
        parts.push(
          t("steam_download_size", {
            done: formatBytes(download.bytesDone),
            total: formatBytes(download.bytesTotal),
          })
        );
      }

      if (download.bytesPerSecond) {
        parts.push(
          inMegabytes
            ? `${formatBytes(download.bytesPerSecond)}/s`
            : formatBytesToMbps(download.bytesPerSecond)
        );
      }

      return parts.join(" · ");
    },
    [inMegabytes, t]
  );
}
