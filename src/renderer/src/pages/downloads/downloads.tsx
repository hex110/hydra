import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDownIcon, LinkIcon, UnlinkIcon } from "@primer/octicons-react";

import { Button, type ContextMenuItemData } from "@renderer/components";
import { useAppSelector, useDownload, useLibrary } from "@renderer/hooks";
import { Downloader } from "@shared";
import type { GameShop, LibraryGame } from "@types";

import { isGameSeeding } from "../../features/activity/activity";
import type { ActivityItem } from "../../features/activity/activity.types";
import { useActivity } from "../../features/activity/use-activity";
import { BinaryNotFoundModal } from "../shared-modals/binary-not-found-modal";
import { ActivityListRow } from "./activity-list-row";
import { ActivitySection } from "./activity-section";
import { DownloadHero } from "./download-hero";
import { UpdatesToolbar } from "./updates-toolbar";
import { useCompletedDownloadStates } from "./use-completed-download-states";
import { useGameDownloadActions } from "./use-game-download-actions";
import "./downloads.scss";

export default function Downloads() {
  const { t } = useTranslation("downloads");
  const { updateLibrary } = useLibrary();
  const checkGameUpdates = useAppSelector(
    (state) => state.userPreferences.value?.checkGameUpdates
  );
  const { groups, hero, seedingStatus, loaded } = useActivity();
  const actions = useGameDownloadActions();
  const { isGameDeleting, pauseSeeding, resumeSeeding } = useDownload();
  const extraction = useAppSelector((state) => state.download.extraction);

  const [showBinaryNotFoundModal, setShowBinaryNotFoundModal] = useState(false);

  useEffect(
    () => window.electron.onExtractionComplete(() => void updateLibrary()),
    [updateLibrary]
  );

  const finishedItems = useMemo(
    () => [...groups.needsYou, ...groups.recent],
    [groups.needsYou, groups.recent]
  );
  const completedStates = useCompletedDownloadStates(finishedItems);

  const queuedGameIds = useMemo(
    () =>
      groups.upNext.flatMap((item) =>
        item.source.kind === "game-download" ? [item.source.game.id] : []
      ),
    [groups.upNext]
  );

  const getSeedingMenuItems = (game: LibraryGame): ContextMenuItemData[] => {
    if (game.download?.downloader !== Downloader.Torrent) return [];

    const deleting = isGameDeleting(game.id);

    return isGameSeeding(game, seedingStatus)
      ? [
          {
            id: "stop-seeding",
            label: t("stop_seeding"),
            icon: <UnlinkIcon size={16} />,
            disabled: deleting,
            onClick: () => pauseSeeding(game.shop, game.objectId),
          },
        ]
      : [
          {
            id: "resume-seeding",
            label: t("resume_seeding"),
            icon: <LinkIcon size={16} />,
            disabled: deleting,
            onClick: () => resumeSeeding(game.shop, game.objectId),
          },
        ];
  };

  const openInstaller = (shop: GameShop, objectId: string) =>
    window.electron.openGameInstaller(shop, objectId).then((wasOpened) => {
      if (!wasOpened) setShowBinaryNotFoundModal(true);
      void updateLibrary();
    });

  const context = {
    actions,
    completedStates,
    queuedGameIds,
    getSeedingMenuItems,
    openInstaller,
  };

  const clearAll = async () => {
    const clearable = groups.recent.filter((item) => item.canClear);
    const games = clearable.flatMap((item) =>
      item.source.kind === "game-download" ? [item.source.game] : []
    );

    await Promise.all([
      games.length > 0 ? actions.dismiss(games) : undefined,
      ...clearable.map((item) => {
        if (item.source.kind === "task") {
          return window.electron.dismissBackgroundTask(item.source.task.id);
        }
        if (item.source.kind === "mod-download") {
          return window.electron.dismissModDownload(item.source.download.id);
        }
        return undefined;
      }),
    ]);
  };

  // Not the empty state while the first data is still on its way.
  if (!loaded) return null;

  const isEmpty =
    groups.now.length +
      groups.upNext.length +
      groups.needsYou.length +
      groups.recent.length ===
    0;

  const rows = (items: ActivityItem[]) =>
    items.map((item) => (
      <ActivityListRow key={item.key} item={item} context={context} />
    ));

  const heroGame =
    hero?.source.kind === "game-download" ? hero.source.game : null;
  const nowRows = groups.now.filter((item) => item !== hero);

  return (
    <>
      <BinaryNotFoundModal
        visible={showBinaryNotFoundModal}
        onClose={() => setShowBinaryNotFoundModal(false)}
      />
      {actions.modals}

      {checkGameUpdates !== false && <UpdatesToolbar />}

      {isEmpty && (
        <div className="downloads__no-downloads">
          <div className="downloads__arrow-icon">
            <ArrowDownIcon size={24} />
          </div>
          <h2>{t("no_downloads_title")}</h2>
          <p>{t("no_downloads_description")}</p>
        </div>
      )}

      {groups.now.length > 0 && (
        <ActivitySection
          title={t("activity_now")}
          count={groups.now.length}
          lead={
            heroGame && (
              <DownloadHero
                game={heroGame}
                isGameDownloading={actions.isGameDownloading(heroGame)}
                isExtractingNow={extraction?.visibleId === heroGame.id}
                onPause={actions.pause}
                onResume={actions.resume}
                onCancel={actions.requestCancel}
              />
            )
          }
        >
          {rows(nowRows)}
        </ActivitySection>
      )}

      {groups.upNext.length > 0 && (
        <ActivitySection
          title={t("activity_up_next")}
          count={groups.upNext.length}
        >
          {rows(groups.upNext)}
        </ActivitySection>
      )}

      {groups.needsYou.length > 0 && (
        <ActivitySection
          title={t("activity_needs_you")}
          count={groups.needsYou.length}
        >
          {rows(groups.needsYou)}
        </ActivitySection>
      )}

      {groups.recent.length > 0 && (
        <ActivitySection
          title={t("activity_recent")}
          count={groups.recent.length}
          action={
            groups.recent.some((item) => item.canClear) && (
              <Button
                theme="outline"
                size="small"
                onClick={() => void clearAll()}
              >
                {t("clear_all_downloads")}
              </Button>
            )
          }
        >
          {rows(groups.recent)}
        </ActivitySection>
      )}
    </>
  );
}
