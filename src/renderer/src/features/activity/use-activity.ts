import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LibraryGame, SeedingStatus } from "@types";
import {
  Downloader,
  formatBytes,
  formatReleaseVersion,
  parseReleaseVersion,
} from "@shared";

import { DOWNLOADER_NAME } from "@renderer/constants";
import { getEpicManagedError } from "@renderer/helpers/epic-managed-error";
import { getExtractionFailureText } from "@renderer/helpers/extraction-failure";
import { formatDownloadProgress } from "@renderer/helpers";
import {
  useAppSelector,
  useBackgroundTasks,
  useDate,
  useDownload,
  useDownloadLayout,
  useLibrary,
  useModDownloads,
  useSteamDownloads,
} from "@renderer/hooks";
import { useModDownloadText } from "../../pages/mods/mod-download-state";

import {
  fromBackgroundTask,
  fromGameDownload,
  fromGameUpdate,
  fromModDownload,
  fromSteamDownload,
  groupActivity,
  hasAvailableUpdate,
  isGameSeeding,
  selectHero,
} from "./activity";
import type { ActivityItem } from "./activity.types";
import { useSteamDownloadText } from "./steam-download-text";
import { useTaskText } from "./use-task-text";

const describeRelease = (title: string) =>
  formatReleaseVersion(parseReleaseVersion(title)) ?? title;

/** Seeding state pushed by the main process while torrents run. */
function useSeedingStatus() {
  const [seedingStatus, setSeedingStatus] = useState<SeedingStatus[]>([]);

  useEffect(
    () => window.electron.onSeedingStatus((value) => setSeedingStatus(value)),
    []
  );

  return seedingStatus;
}

/** Every source of work, as one list in four sections. */
export function useActivity() {
  const { t } = useTranslation("downloads");
  const { t: tMods } = useTranslation("mods");
  const { formatDate } = useDate();

  const { downloadLibrary, library: fullLibrary } = useLibrary();
  const libraryLoaded = useAppSelector((state) => state.library.hasLoaded);
  const { layoutState } = useDownloadLayout();
  const extraction = useAppSelector((state) => state.download.extraction);
  const preferences = useAppSelector((state) => state.userPreferences.value);
  const { lastPacket } = useDownload();
  const seedingStatus = useSeedingStatus();
  const steamDownloads = useSteamDownloads();
  const modDownloads = useModDownloads();
  const { tasks, loaded: tasksLoaded } = useBackgroundTasks();

  const describeSteam = useSteamDownloadText();
  const describeMod = useModDownloadText();
  const taskText = useTaskText();

  const checkUpdates = preferences?.checkGameUpdates !== false;

  const groups = useMemo(() => {
    const coverOf = (shop: string, objectId: string) => {
      const game = fullLibrary.find(
        (item) => item.shop === shop && item.objectId === objectId
      );
      return game?.customCoverImageUrl || game?.libraryImageUrl || null;
    };

    const gameStatus = (
      game: LibraryGame,
      isExtractingNow: boolean,
      seeding: boolean
    ) => {
      const download = game.download!;

      if (isExtractingNow && extraction) {
        return `${t("extracting")} (${Math.round(extraction.progress * 100)}%)`;
      }

      if (
        download.downloader === Downloader.Epic &&
        download.status === "error"
      ) {
        const { key, ns } = getEpicManagedError(download.epic?.error);
        return t(key, { ns });
      }

      if (download.extractionFailed && !download.extracting) {
        const failure = getExtractionFailureText(t, download.extractionFailure);
        return `${failure.title}. ${failure.description}`;
      }

      const parts: string[] = [];
      if (download.awaitingDebrid && download.debridAutoResume) {
        parts.push(t("waiting_for_debrid"));
      } else if (download.progress < 1) {
        if (download.status === "paused") {
          parts.push(download.queued ? t("queued") : t("paused"));
        }
        parts.push(formatDownloadProgress(download.progress));
      }
      if (download.fileSize && download.fileSize > 0) {
        parts.push(formatBytes(download.fileSize));
      }
      if (download.progress === 1 && seeding) parts.push(t("seeding"));

      return parts.join(" · ");
    };

    const items: ActivityItem[] = [];

    for (const game of downloadLibrary) {
      const download = game.download;
      if (!download) continue;

      const isExtractingNow = extraction?.visibleId === game.id;
      const isLive = lastPacket?.gameId === game.id;
      const seeding = isGameSeeding(game, seedingStatus);

      let liveProgress: number | null = null;
      if (isExtractingNow && extraction) liveProgress = extraction.progress;
      else if (isLive && lastPacket) liveProgress = lastPacket.progress;

      const item = fromGameDownload(game, {
        title: game.title,
        badge: DOWNLOADER_NAME[Number(download.downloader)] ?? "",
        status: gameStatus(game, isExtractingNow, seeding),
        isLive,
        isExtractingNow,
        isSeeding: seeding,
        liveProgress,
      });
      if (item) items.push(item);
    }

    for (const download of steamDownloads) {
      items.push(
        fromSteamDownload(download, {
          title: download.title,
          badge: t("badge_steam"),
          status: describeSteam(download),
          coverUrl: coverOf("steam", download.appId),
        })
      );
    }

    for (const download of modDownloads) {
      items.push(
        fromModDownload(download, {
          title: tMods("download_row_title", {
            mod: download.modName,
            game: download.gameTitle,
          }),
          badge: t("badge_mod"),
          status: describeMod(download),
          coverUrl: coverOf(download.shop, download.objectId),
        })
      );
    }

    if (checkUpdates) {
      for (const game of fullLibrary.filter(hasAvailableUpdate)) {
        const update = game.availableUpdate!.release;
        const installed = game.installedVersion;
        const versions = installed
          ? t("game_update_versions", {
              installed: describeRelease(installed.title),
              available: describeRelease(update.title),
            })
          : describeRelease(update.title);

        items.push(
          fromGameUpdate(game, {
            title: game.title,
            badge: t("badge_update"),
            status: [
              versions,
              update.downloadSourceName,
              update.fileSize,
              update.uploadDate ? formatDate(update.uploadDate) : null,
            ]
              .filter(Boolean)
              .join(" · "),
          })
        );
      }
    }

    for (const task of tasks) {
      items.push(
        fromBackgroundTask(task, {
          title: taskText.title(task),
          badge: taskText.badge(task),
          status: taskText.status(task),
        })
      );
    }

    return groupActivity(items, layoutState);
  }, [
    checkUpdates,
    describeMod,
    describeSteam,
    downloadLibrary,
    extraction,
    formatDate,
    fullLibrary,
    lastPacket,
    layoutState,
    modDownloads,
    seedingStatus,
    steamDownloads,
    t,
    taskText,
    tMods,
    tasks,
  ]);

  const hero = useMemo(() => selectHero(groups), [groups]);

  return {
    groups,
    hero,
    seedingStatus,
    loaded: libraryLoaded && tasksLoaded,
  };
}
