import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { XIcon } from "@primer/octicons-react";

import { Button } from "@renderer/components";
import { buildGameDetailsPath } from "@renderer/helpers";
import { useSteamDownloads } from "@renderer/hooks";

import { useSteamDownloadText } from "./steam-download-text";

// Same rows as the background tasks above it.
import "./background-tasks-section.scss";

/** Installs Steam is doing for library games; Steam does the downloading. */
export function SteamDownloadsSection() {
  const { t } = useTranslation("downloads");
  const navigate = useNavigate();
  const describe = useSteamDownloadText();
  const downloads = useSteamDownloads();

  if (downloads.length === 0) return null;

  return (
    <section className="background-tasks">
      <h2>{t("steam_downloads_title")}</h2>
      <ul className="background-tasks__list">
        {downloads.map((download) => (
          <li key={download.appId} className="background-tasks__item">
            <div className="background-tasks__details">
              <strong>{download.title}</strong>
              <span className="background-tasks__muted">
                {describe(download)}
              </span>
              {download.status !== "waiting" && (
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
                  buildGameDetailsPath({
                    shop: "steam",
                    objectId: download.appId,
                    title: download.title,
                  })
                )
              }
            >
              {t("steam_download_open_game")}
            </Button>
            <Button
              theme="outline"
              onClick={() => void window.electron.openSteamDownloads()}
            >
              {t("steam_download_open_steam")}
            </Button>
            {download.status === "waiting" && (
              <button
                type="button"
                className="background-tasks__dismiss"
                aria-label={t("steam_download_dismiss")}
                title={t("steam_download_dismiss")}
                onClick={() =>
                  void window.electron.dismissSteamDownload(download.appId)
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
