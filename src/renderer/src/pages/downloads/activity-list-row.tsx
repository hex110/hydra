import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { PackageIcon, SyncIcon } from "@primer/octicons-react";

import { ActivityRow, Button } from "@renderer/components";
import { buildGameDetailsPath, buildGameModsPath } from "@renderer/helpers";
import { useLibrary, useToast } from "@renderer/hooks";
import type { BackgroundTask, LibraryGame, ModDownload } from "@types";

import type { ActivityItem } from "../../features/activity/activity.types";
import {
  GameDownloadRow,
  type GameDownloadRowContext,
} from "./game-download-row";

interface Props {
  item: ActivityItem;
  context: GameDownloadRowContext;
}

/** One row of the Downloads page, whatever started the work. */
export function ActivityListRow({ item, context }: Readonly<Props>) {
  const { source } = item;

  switch (source.kind) {
    case "game-download":
      return (
        <GameDownloadRow item={item} game={source.game} context={context} />
      );
    case "steam-install":
      return (
        <SteamRow
          item={item}
          appId={source.download.appId}
          status={source.download.status}
        />
      );
    case "mod-download":
      return <ModRow item={item} download={source.download} />;
    case "game-update":
      return <UpdateRow item={item} game={source.game} />;
    case "task":
      return <TaskRow item={item} task={source.task} />;
  }
}

const common = (item: ActivityItem) => ({
  title: item.title,
  coverUrl: item.game?.coverUrl,
  badge: item.badge,
  status: item.status,
  isError: item.isError,
  progress: item.progress,
  showProgress: item.showProgress,
});

function SteamRow({
  item,
  appId,
  status,
}: Readonly<{
  item: ActivityItem;
  appId: string;
  status: string;
}>) {
  const { t } = useTranslation("downloads");
  const navigate = useNavigate();
  const openGame = () =>
    navigate(
      buildGameDetailsPath({
        shop: "steam",
        objectId: appId,
        title: item.title,
      })
    );

  return (
    <ActivityRow
      {...common(item)}
      icon={<PackageIcon size={20} />}
      onOpen={openGame}
      menu={[
        { label: t("open_game"), onClick: openGame },
        {
          label: t("steam_download_open_steam"),
          onClick: () => void window.electron.openSteamDownloads(),
        },
      ]}
      onClear={
        status === "waiting"
          ? () => void window.electron.dismissSteamDownload(appId)
          : undefined
      }
      clearLabel={t("clear")}
    />
  );
}

function ModRow({
  item,
  download,
}: Readonly<{ item: ActivityItem; download: ModDownload }>) {
  const { t } = useTranslation("downloads");
  const { t: tMods } = useTranslation("mods");
  const navigate = useNavigate();
  const { showErrorToast } = useToast();

  const openMods = () =>
    navigate(
      buildGameModsPath({
        shop: download.shop,
        objectId: download.objectId,
        title: download.gameTitle,
      })
    );

  const retry = async () => {
    if (!(await window.electron.retryModDownload(download.id))) {
      showErrorToast(tMods("download_retry_failed"));
    }
  };

  let primary: ReactNode = null;
  if (download.state === "failed") {
    primary = (
      <Button size="small" onClick={() => void retry()}>
        <SyncIcon size={14} />
        {t("task_retry")}
      </Button>
    );
  } else if (download.state === "done" && download.waitsForOptions) {
    primary = (
      <Button size="small" onClick={openMods}>
        {t("choose_options")}
      </Button>
    );
  }

  return (
    <ActivityRow
      {...common(item)}
      onOpen={openMods}
      statusTitle={download.errorMessage ?? undefined}
      primary={primary}
      menu={[
        { label: tMods("download_open_mods"), onClick: openMods },
        {
          label: t("cancel"),
          show: item.section === "now",
          onClick: () => void window.electron.cancelModDownload(download.id),
        },
      ]}
      onClear={
        item.canClear
          ? () => void window.electron.dismissModDownload(download.id)
          : undefined
      }
      clearLabel={t("clear")}
    />
  );
}

function UpdateRow({
  item,
  game,
}: Readonly<{ item: ActivityItem; game: LibraryGame }>) {
  const { t } = useTranslation("downloads");
  const navigate = useNavigate();
  const { updateLibrary } = useLibrary();

  return (
    <ActivityRow
      {...common(item)}
      onOpen={() => navigate(buildGameDetailsPath(game))}
      primary={
        <Button
          size="small"
          onClick={() => navigate(buildGameDetailsPath(game, { update: "1" }))}
        >
          {t("update_game")}
        </Button>
      }
      onClear={async () => {
        await window.electron.dismissGameUpdate(game.shop, game.objectId);
        void updateLibrary();
      }}
      clearLabel={t("ignore_this_version")}
    />
  );
}

function TaskRow({
  item,
  task,
}: Readonly<{ item: ActivityItem; task: BackgroundTask }>) {
  const { t } = useTranslation("downloads");
  const { showErrorToast } = useToast();

  return (
    <ActivityRow
      {...common(item)}
      icon={<SyncIcon size={20} />}
      primary={
        task.state === "failed" ? (
          <Button
            size="small"
            onClick={() =>
              window.electron
                .retryBackgroundTask(task.id)
                .catch(() => showErrorToast(t("task_retry_failed")))
            }
          >
            <SyncIcon size={14} />
            {t("task_retry")}
          </Button>
        ) : undefined
      }
      onClear={
        item.canClear
          ? () => void window.electron.dismissBackgroundTask(task.id)
          : undefined
      }
      clearLabel={t("clear")}
    />
  );
}
