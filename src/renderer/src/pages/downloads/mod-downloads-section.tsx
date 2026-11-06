import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { SyncIcon } from "@primer/octicons-react";

import { ActivityRow, Button } from "@renderer/components";
import { buildGameModsPath } from "@renderer/helpers";
import { useModDownloads, useToast } from "@renderer/hooks";
import type { ModDownload } from "@types";

import { useModDownloadText } from "../mods/mod-download-state";
import { ActivitySection } from "./activity-section";
import { useLibraryCover } from "./use-library-cover";

const isActive = (download: ModDownload) =>
  download.state === "waiting-torbox" || download.state === "downloading";

/** Mod downloads, next to game downloads; they survive leaving the Mods page. */
export function ModDownloadsSection() {
  const { t } = useTranslation("mods");
  const { t: tDownloads } = useTranslation("downloads");
  const navigate = useNavigate();
  const { showErrorToast } = useToast();
  const describe = useModDownloadText();
  const downloads = useModDownloads();
  const coverOf = useLibraryCover();

  if (downloads.length === 0) return null;

  const retry = async (download: ModDownload) => {
    if (!(await window.electron.retryModDownload(download.id)))
      showErrorToast(t("download_retry_failed"));
  };

  return (
    <ActivitySection title={t("downloads_title")}>
      {downloads.map((download) => {
        const openMods = () =>
          navigate(
            buildGameModsPath({
              shop: download.shop,
              objectId: download.objectId,
              title: download.gameTitle,
            })
          );

        return (
          <ActivityRow
            key={download.id}
            title={t("download_row_title", {
              mod: download.modName,
              game: download.gameTitle,
            })}
            coverUrl={coverOf(download.shop, download.objectId)}
            onOpen={openMods}
            badge={tDownloads("badge_mod")}
            status={describe(download)}
            statusTitle={download.errorMessage ?? undefined}
            isError={download.state === "failed"}
            showProgress={isActive(download) || download.state === "installing"}
            progress={
              download.state === "downloading" ? download.progress : null
            }
            primary={
              download.state === "failed" ? (
                <Button size="small" onClick={() => void retry(download)}>
                  <SyncIcon size={14} />
                  {tDownloads("task_retry")}
                </Button>
              ) : undefined
            }
            menu={[
              { label: t("download_open_mods"), onClick: openMods },
              {
                label: tDownloads("cancel"),
                show: isActive(download),
                onClick: () =>
                  void window.electron.cancelModDownload(download.id),
              },
            ]}
            onClear={
              download.state === "done" || download.state === "failed"
                ? () => void window.electron.dismissModDownload(download.id)
                : undefined
            }
          />
        );
      })}
    </ActivitySection>
  );
}
