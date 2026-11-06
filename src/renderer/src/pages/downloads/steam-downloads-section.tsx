import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { PackageIcon } from "@primer/octicons-react";

import { ActivityRow } from "@renderer/components";
import { buildGameDetailsPath } from "@renderer/helpers";
import { useSteamDownloads } from "@renderer/hooks";

import { ActivitySection } from "./activity-section";
import { useSteamDownloadText } from "./steam-download-text";
import { useLibraryCover } from "./use-library-cover";

/** Installs Steam is doing for library games; Steam does the downloading. */
export function SteamDownloadsSection() {
  const { t } = useTranslation("downloads");
  const navigate = useNavigate();
  const describe = useSteamDownloadText();
  const downloads = useSteamDownloads();
  const coverOf = useLibraryCover();

  if (downloads.length === 0) return null;

  return (
    <ActivitySection title={t("steam_downloads_title")}>
      {downloads.map((download) => {
        const openGame = () =>
          navigate(
            buildGameDetailsPath({
              shop: "steam",
              objectId: download.appId,
              title: download.title,
            })
          );

        return (
          <ActivityRow
            key={download.appId}
            title={download.title}
            coverUrl={coverOf("steam", download.appId)}
            icon={<PackageIcon size={20} />}
            onOpen={openGame}
            badge={t("badge_steam")}
            status={describe(download)}
            showProgress={download.status !== "waiting"}
            progress={download.progress}
            menu={[
              { label: t("open_game"), onClick: openGame },
              {
                label: t("steam_download_open_steam"),
                onClick: () => void window.electron.openSteamDownloads(),
              },
            ]}
            onClear={
              download.status === "waiting"
                ? () =>
                    void window.electron.dismissSteamDownload(download.appId)
                : undefined
            }
          />
        );
      })}
    </ActivitySection>
  );
}
