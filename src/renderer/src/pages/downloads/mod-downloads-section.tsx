import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { SyncIcon, XIcon } from "@primer/octicons-react";

import { Button } from "@renderer/components";
import { buildGameModsPath } from "@renderer/helpers";
import { useModDownloads, useToast } from "@renderer/hooks";
import type { ModDownload } from "@types";

import { useModDownloadText } from "../mods/mod-download-state";

// Same rows as the background tasks above it.
import "./background-tasks-section.scss";

const isActive = (download: ModDownload) =>
  download.state === "waiting-torbox" || download.state === "downloading";

/** Mod downloads, next to game downloads; they survive leaving the Mods page. */
export function ModDownloadsSection() {
  const { t } = useTranslation("mods");
  const navigate = useNavigate();
  const { showErrorToast } = useToast();
  const describe = useModDownloadText();
  const downloads = useModDownloads();

  if (downloads.length === 0) return null;

  const retry = async (download: ModDownload) => {
    if (!(await window.electron.retryModDownload(download.id)))
      showErrorToast(t("download_retry_failed"));
  };

  return (
    <section className="background-tasks">
      <h2>{t("downloads_title")}</h2>
      <ul className="background-tasks__list">
        {downloads.map((download) => (
          <li key={download.id} className="background-tasks__item">
            <div className="background-tasks__details">
              <strong>
                {t("download_row_title", {
                  mod: download.modName,
                  game: download.gameTitle,
                })}
              </strong>
              <span
                className="background-tasks__muted"
                title={download.errorMessage ?? undefined}
              >
                {describe(download)}
              </span>
              {download.state === "downloading" && (
                <progress
                  className="background-tasks__progress"
                  max={1}
                  value={download.progress ?? undefined}
                />
              )}
            </div>
            <Button
              theme="outline"
              onClick={() =>
                navigate(
                  buildGameModsPath({
                    shop: download.shop,
                    objectId: download.objectId,
                    title: download.gameTitle,
                  })
                )
              }
            >
              {t("download_open_mods")}
            </Button>
            {isActive(download) && (
              <Button
                theme="outline"
                onClick={() =>
                  void window.electron.cancelModDownload(download.id)
                }
              >
                {t("download_cancel")}
              </Button>
            )}
            {download.state === "failed" && (
              <Button theme="outline" onClick={() => void retry(download)}>
                <SyncIcon size={14} />
                {t("download_retry")}
              </Button>
            )}
            {(download.state === "done" || download.state === "failed") && (
              <button
                type="button"
                className="background-tasks__dismiss"
                aria-label={t("download_dismiss")}
                title={t("download_dismiss")}
                onClick={() =>
                  void window.electron.dismissModDownload(download.id)
                }
              >
                <XIcon size={14} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
