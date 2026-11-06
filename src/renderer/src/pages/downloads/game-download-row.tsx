import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ColumnsIcon,
  GearIcon,
  PlayIcon,
  XCircleIcon,
} from "@primer/octicons-react";

import {
  ActivityRow,
  Button,
  type ContextMenuItemData,
} from "@renderer/components";
import type { DropdownMenuItem } from "@renderer/components/dropdown-menu/dropdown-menu";
import { buildGameDetailsPath } from "@renderer/helpers";
import { useAppSelector } from "@renderer/hooks";
import { Downloader } from "@shared";
import type { LibraryGame } from "@types";

import { isFinishedDownload } from "../../features/activity/activity";
import type { ActivityItem } from "../../features/activity/activity.types";
import type { GameDownloadActions } from "./use-game-download-actions";
import {
  type CompletedDownloadState,
  useCompletedDownloadActions,
} from "./use-completed-download-actions";

export interface GameDownloadRowContext {
  actions: GameDownloadActions;
  completedStates: Record<string, CompletedDownloadState>;
  queuedGameIds: string[];
  getSeedingMenuItems: (game: LibraryGame) => ContextMenuItemData[];
  openInstaller: (shop: LibraryGame["shop"], objectId: string) => void;
}

interface RowProps {
  item: ActivityItem;
  game: LibraryGame;
  context: GameDownloadRowContext;
}

const baseProps = (item: ActivityItem, onOpen: () => void) => ({
  title: item.title,
  coverUrl: item.game?.coverUrl,
  onOpen,
  badge: item.badge,
  status: item.status,
  isError: item.isError,
  progress: item.progress,
  showProgress: item.showProgress,
});

export function GameDownloadRow({ item, game, context }: Readonly<RowProps>) {
  // Extraction in progress has nothing to act on yet.
  if (isFinishedDownload(game) && item.section !== "now") {
    return <FinishedRow item={item} game={game} context={context} />;
  }

  return <PendingRow item={item} game={game} context={context} />;
}

function FinishedRow({ item, game, context }: Readonly<RowProps>) {
  const { t } = useTranslation("downloads");
  const navigate = useNavigate();
  const { actions } = context;

  const { primary, menuSlot } = useCompletedDownloadActions({
    game,
    state: context.completedStates[game.id] ?? "open-folder",
    extraManageItems: context.getSeedingMenuItems(game),
    onExtract: () => void actions.extract(game.shop, game.objectId),
    onInstall: () => context.openInstaller(game.shop, game.objectId),
    onOpenFolder: () =>
      void window.electron.openGameInstallerPath(game.shop, game.objectId),
  });

  return (
    <ActivityRow
      {...baseProps(item, () => navigate(buildGameDetailsPath(game)))}
      primary={primary}
      menuSlot={menuSlot}
      onClear={item.canClear ? () => void actions.dismiss([game]) : undefined}
      clearLabel={t("clear")}
    />
  );
}

function PendingRow({ item, game, context }: Readonly<RowProps>) {
  const { t } = useTranslation("downloads");
  const navigate = useNavigate();
  const preferences = useAppSelector((state) => state.userPreferences.value);
  const { actions, queuedGameIds } = context;
  const download = game.download;
  const downloading = actions.isGameDownloading(game);

  const resumeBlocked =
    (download?.downloader === Downloader.RealDebrid &&
      !preferences?.realDebridApiToken) ||
    (download?.downloader === Downloader.Premiumize &&
      !preferences?.premiumizeApiToken) ||
    (download?.downloader === Downloader.AllDebrid &&
      !preferences?.allDebridApiToken) ||
    (download?.downloader === Downloader.TorBox &&
      !preferences?.torBoxApiToken);

  const queueIndex = queuedGameIds.indexOf(game.id);
  const isInQueue = queueIndex !== -1 && !!download?.queued;
  const epicFailed =
    download?.downloader === Downloader.Epic && download.status === "error";

  const canResume = item.section !== "now" && !downloading && !resumeBlocked;

  const menu: DropdownMenuItem[] = [
    {
      label: t("pause"),
      show:
        downloading ||
        (!!download?.awaitingDebrid && !!download.debridAutoResume),
      onClick: () => void actions.pause(game.shop, game.objectId),
      icon: <ColumnsIcon />,
    },
    {
      label: t("integrations", { ns: "settings" }),
      show: epicFailed,
      onClick: () => navigate("/settings?tab=integrations"),
      icon: <GearIcon />,
    },
    {
      label: t("move_up"),
      show: isInQueue && queueIndex > 0,
      onClick: () => void actions.move(game.shop, game.objectId, "up"),
      icon: <ArrowUpIcon />,
    },
    {
      label: t("move_down"),
      show: isInQueue && queueIndex < queuedGameIds.length - 1,
      onClick: () => void actions.move(game.shop, game.objectId, "down"),
      icon: <ArrowDownIcon />,
    },
    {
      label: t("cancel"),
      show: item.section !== "now" || downloading,
      onClick: () => actions.requestCancel(game.shop, game.objectId),
      icon: <XCircleIcon />,
    },
  ];

  return (
    <ActivityRow
      {...baseProps(item, () => navigate(buildGameDetailsPath(game)))}
      primary={
        canResume ? (
          <Button
            size="small"
            onClick={() => void actions.resume(game.shop, game.objectId)}
          >
            <PlayIcon size={14} />
            {item.section === "needsYou" ? t("task_retry") : t("resume")}
          </Button>
        ) : undefined
      }
      menu={menu}
    />
  );
}
