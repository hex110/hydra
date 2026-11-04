import { useTranslation } from "react-i18next";

import { formatBytes } from "@shared";
import type { ModDownload } from "@types";

/** A mod download's state in words, the same on every surface. */
export function useModDownloadText() {
  const { t } = useTranslation("mods");
  return (download: ModDownload) => {
    switch (download.state) {
      case "downloading":
        return download.progress !== null
          ? t("download_state_downloading_percent", {
              percent: Math.round(download.progress * 100),
              size: download.bytesTotal ? formatBytes(download.bytesTotal) : "",
            })
          : t("download_state_downloading");
      case "failed": {
        const reason = t(
          `error_${(download.error ?? "failed").replaceAll("-", "_")}`
        );
        // TorBox's and the server's own words say what to fix.
        return download.errorMessage &&
          (download.error === "torbox-failed" ||
            download.error === "download-failed")
          ? t("download_state_failed_detail", {
              reason,
              detail: download.errorMessage,
            })
          : t("download_state_failed", { reason });
      }
      case "done":
        return download.waitsForOptions
          ? t("download_state_done_options")
          : t("download_state_done");
      default:
        return t(`download_state_${download.state.replaceAll("-", "_")}`);
    }
  };
}

export function ModDownloadState({
  download,
}: Readonly<{ download: ModDownload }>) {
  const describe = useModDownloadText();
  return (
    <span
      className={
        download.state === "failed" ? "mods__state--error" : "mods__state"
      }
      title={download.errorMessage ?? undefined}
    >
      {describe(download)}
    </span>
  );
}
