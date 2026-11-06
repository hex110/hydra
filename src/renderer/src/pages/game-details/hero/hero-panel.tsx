import { useContext } from "react";
import { useTranslation } from "react-i18next";

import { useAppSelector, useDate, useDownload } from "@renderer/hooks";

import { HeroPanelActions } from "./hero-panel-actions";
import { HeroPanelPlaytime } from "./hero-panel-playtime";

import { gameDetailsContext } from "@renderer/context";
import { getOfficialStoreMembers } from "@shared";
import { isGameInstalled } from "@renderer/helpers";
import { useOwnedSteamAppId } from "../use-owned-steam-app";
import { useSteamDownload } from "@renderer/hooks";
import { useSteamDownloadText } from "../../downloads/steam-download-text";
import "./hero-panel.scss";

export function HeroPanel() {
  const { t } = useTranslation("game_details");

  const { formatDate } = useDate();

  const { game, downloadGame, repacks, presentation, catalogueGame } =
    useContext(gameDetailsContext);

  const { steam: steamMember } = getOfficialStoreMembers(
    presentation?.members ?? (game ? [game] : [])
  );
  const ownedSteamAppId = useOwnedSteamAppId(catalogueGame);
  const steamAppId = steamMember?.objectId ?? ownedSteamAppId;
  const liveSteamDownload = useSteamDownload(steamAppId);
  const describeSteamDownload = useSteamDownloadText();

  const { lastPacket } = useDownload();

  const extraction = useAppSelector((state) => state.download.extraction);

  const isGameDownloading =
    downloadGame?.download?.status === "active" &&
    lastPacket?.gameId === downloadGame?.id;

  const isExtracting = extraction?.visibleId === downloadGame?.id;

  const steamDownload =
    game && isGameInstalled(game) ? null : liveSteamDownload;

  const getInfo = () => {
    if (steamDownload) {
      return (
        <>
          <p>{t("downloading_through_steam")}</p>
          <p>{describeSteamDownload(steamDownload)}</p>
        </>
      );
    }

    if (!game) {
      const [latestRepack] = repacks;

      if (latestRepack) {
        const lastUpdate = latestRepack.uploadDate
          ? formatDate(latestRepack.uploadDate!)
          : "";
        const repacksCount = repacks.length;

        return (
          <>
            <p>{t("updated_at", { updated_at: lastUpdate })}</p>
            <p>{t("download_options", { count: repacksCount })}</p>
          </>
        );
      }

      return <p>{t("no_downloads")}</p>;
    }

    return <HeroPanelPlaytime />;
  };

  const showProgressBar =
    (downloadGame?.download?.status === "active" &&
      downloadGame.download.progress < 1) ||
    downloadGame?.download?.status === "paused";

  const showExtractionProgressBar = isExtracting;

  return (
    <div className="hero-panel__container">
      <div className="hero-panel">
        <div className="hero-panel__content">{getInfo()}</div>
        <div className="hero-panel__actions">
          <HeroPanelActions />
        </div>

        {showProgressBar && (
          <progress
            max={1}
            value={
              isGameDownloading
                ? lastPacket?.progress
                : downloadGame?.download?.progress
            }
            className={`hero-panel__progress-bar ${
              downloadGame?.download?.status === "paused"
                ? "hero-panel__progress-bar--disabled"
                : ""
            }`}
          />
        )}

        {steamDownload &&
          steamDownload.status !== "waiting" &&
          !showProgressBar && (
            <progress
              max={1}
              value={steamDownload.progress ?? undefined}
              className="hero-panel__progress-bar"
            />
          )}

        {showExtractionProgressBar && (
          <progress
            max={1}
            value={extraction?.progress ?? 0}
            className="hero-panel__progress-bar hero-panel__progress-bar--extraction"
          />
        )}
      </div>
    </div>
  );
}
