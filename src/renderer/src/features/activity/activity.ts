import type {
  BackgroundTask,
  DownloadLayoutState,
  LibraryGame,
  ModDownload,
  SeedingStatus,
  SteamDownload,
} from "@types";
import { Downloader } from "../../../../shared/constants.js";
import {
  getDownloadId,
  getRendererDownloadBucket,
} from "../../../../types/download-contract.js";
import type {
  ActivityGroups,
  ActivityItem,
  ActivitySection,
} from "./activity.types.js";

/** Lower comes first in the bottom bar. */
export const BOTTOM_BAR_PRIORITY = {
  commonRedist: 0,
  extraction: 1,
  gameDownload: 2,
  steamInstall: 3,
  modDownload: 4,
  task: 5,
} as const;

/** The words a row needs, built by the caller with `t`. */
export interface ActivityText {
  title: string;
  badge: string;
  status: string;
}

const coverOf = (game: LibraryGame) =>
  game.customCoverImageUrl || game.libraryImageUrl || null;

const gameOf = (game: LibraryGame) => ({
  shop: game.shop,
  objectId: game.objectId,
  title: game.title,
  coverUrl: coverOf(game),
});

/** The seeding push from the main process wins over the stored status. */
export function isGameSeeding(
  game: LibraryGame,
  seedingStatus: SeedingStatus[]
) {
  const entry = seedingStatus.find((item) => item.gameId === game.id);
  if (entry) {
    const raw = (entry as { status?: unknown }).status;
    return raw === "seeding" || raw === 5;
  }
  return game.download?.status === "seeding";
}

export const isFinishedDownload = (game: LibraryGame) =>
  game.download?.progress === 1 &&
  (game.download.downloader !== Downloader.Epic ||
    game.download.status === "complete");

export const canDismissGameDownload = (
  game: LibraryGame,
  state: { isSeeding: boolean; isExtractingNow: boolean }
) =>
  isFinishedDownload(game) &&
  !game.download?.extracting &&
  !state.isSeeding &&
  !state.isExtractingNow;

export interface GameDownloadContext extends ActivityText {
  isLive: boolean;
  isExtractingNow: boolean;
  isSeeding: boolean;
  /** Live packet progress, or extraction progress while extracting. */
  liveProgress: number | null;
}

/** `null` when the download isn't listed at all (hidden or dismissed). */
export function fromGameDownload(
  game: LibraryGame,
  context: GameDownloadContext
): ActivityItem | null {
  const download = game.download;
  if (!download || download.dismissed) return null;

  const bucket = getRendererDownloadBucket(download, {
    hasLiveProgress: context.isLive && download.status === "active",
    isExtracting: context.isExtractingNow,
  });
  if (bucket === "hidden") return null;

  const epicFailed =
    download.downloader === Downloader.Epic && download.status === "error";
  const extractionFailed = !!download.extractionFailed && !download.extracting;

  let section: ActivitySection;
  if (bucket === "inProgress") section = "now";
  else if (epicFailed) section = "needsYou";
  else if (bucket === "queued") section = "upNext";
  else section = extractionFailed ? "needsYou" : "recent";

  const waitingForDebrid =
    !!download.awaitingDebrid && !!download.debridAutoResume;
  const progress =
    bucket === "inProgress"
      ? (context.liveProgress ?? download.progress)
      : waitingForDebrid
        ? null
        : download.progress;

  return {
    key: `game-download:${game.id}`,
    kind: "game-download",
    section,
    title: context.title,
    game: gameOf(game),
    badge: context.badge,
    status: context.status,
    isError: epicFailed || extractionFailed,
    progress,
    showProgress: section === "now" || section === "upNext",
    sortTime:
      section === "recent"
        ? (download.completedAt ?? download.timestamp ?? 0)
        : (download.timestamp ?? 0),
    bottomBarPriority: context.isExtractingNow
      ? BOTTOM_BAR_PRIORITY.extraction
      : BOTTOM_BAR_PRIORITY.gameDownload,
    canClear: canDismissGameDownload(game, context),
    source: { kind: "game-download", game },
  };
}

export function fromSteamDownload(
  download: SteamDownload,
  context: ActivityText & { coverUrl: string | null }
): ActivityItem {
  const running =
    download.status === "downloading" || download.status === "finishing";

  return {
    key: `steam-install:${download.appId}`,
    kind: "steam-install",
    section: running ? "now" : "upNext",
    title: context.title,
    game: {
      shop: "steam",
      objectId: download.appId,
      title: download.title,
      coverUrl: context.coverUrl,
    },
    badge: context.badge,
    status: context.status,
    isError: false,
    progress: download.status === "waiting" ? null : download.progress,
    showProgress: download.status !== "waiting",
    sortTime: 0,
    bottomBarPriority: BOTTOM_BAR_PRIORITY.steamInstall,
    canClear: download.status === "waiting",
    source: { kind: "steam-install", download },
  };
}

const MOD_RUNNING = new Set<ModDownload["state"]>([
  "waiting-torbox",
  "downloading",
  "installing",
]);

export function fromModDownload(
  download: ModDownload,
  context: ActivityText & { coverUrl: string | null }
): ActivityItem {
  let section: ActivitySection = "recent";
  if (MOD_RUNNING.has(download.state)) section = "now";
  else if (download.state === "failed") section = "needsYou";
  else if (download.waitsForOptions) section = "needsYou";

  return {
    key: `mod-download:${download.id}`,
    kind: "mod-download",
    section,
    title: context.title,
    game: {
      shop: download.shop,
      objectId: download.objectId,
      title: download.gameTitle,
      coverUrl: context.coverUrl,
    },
    badge: context.badge,
    status: context.status,
    isError: download.state === "failed",
    progress: download.state === "downloading" ? download.progress : null,
    showProgress: section === "now",
    sortTime: download.updatedAt,
    bottomBarPriority: BOTTOM_BAR_PRIORITY.modDownload,
    canClear: download.state === "done" || download.state === "failed",
    source: { kind: "mod-download", download },
  };
}

export const hasAvailableUpdate = (game: LibraryGame) =>
  !!game.availableUpdate && !!game.executablePath;

export function fromGameUpdate(
  game: LibraryGame,
  context: ActivityText
): ActivityItem {
  return {
    key: `game-update:${game.id}`,
    kind: "game-update",
    section: "needsYou",
    title: context.title,
    game: gameOf(game),
    badge: context.badge,
    status: context.status,
    isError: false,
    progress: null,
    showProgress: false,
    sortTime: 0,
    bottomBarPriority: BOTTOM_BAR_PRIORITY.task,
    canClear: true,
    source: { kind: "game-update", game },
  };
}

export function fromBackgroundTask(
  task: BackgroundTask,
  context: ActivityText
): ActivityItem {
  const section: ActivitySection = {
    running: "now",
    queued: "upNext",
    failed: "needsYou",
    done: "recent",
  }[task.state] as ActivitySection;

  return {
    key: `task:${task.key}`,
    kind: "task",
    section,
    title: context.title,
    game: null,
    badge: context.badge,
    status: context.status,
    isError: task.state === "failed",
    progress:
      task.total === null ? null : task.processed / Math.max(task.total, 1),
    showProgress: task.state === "running",
    sortTime: task.updatedAt,
    bottomBarPriority: BOTTOM_BAR_PRIORITY.task,
    canClear: task.state === "done" || task.state === "failed",
    source: { kind: "task", task },
  };
}

/** Today's queue order: the queue's own order, then paused, then oldest first. */
export function compareQueuedDownloads(layout: DownloadLayoutState) {
  const queue = new Map(layout.queueOrder.map((id, index) => [id, index]));
  const paused = new Map(layout.pausedOrder.map((id, index) => [id, index]));

  return (left: LibraryGame, right: LibraryGame) => {
    const leftDownload = left.download!;
    const rightDownload = right.download!;
    const leftId = getDownloadId(leftDownload);
    const rightId = getDownloadId(rightDownload);
    const leftInQueue = queue.get(leftId);
    const rightInQueue = queue.get(rightId);
    const leftInPaused = paused.get(leftId);
    const rightInPaused = paused.get(rightId);

    if (leftInQueue != null && rightInQueue != null) {
      return leftInQueue - rightInQueue;
    }
    if (leftInQueue != null) return -1;
    if (rightInQueue != null) return 1;

    if (leftInPaused != null && rightInPaused != null) {
      return leftInPaused - rightInPaused;
    }

    return (leftDownload.timestamp ?? 0) - (rightDownload.timestamp ?? 0);
  };
}

const UP_NEXT_KIND_ORDER: Record<ActivityItem["kind"], number> = {
  "game-download": 0,
  "steam-install": 1,
  "mod-download": 2,
  "game-update": 3,
  task: 4,
};

// Failures first, then installers waiting for options, then updates.
const needsYouRank = (item: ActivityItem) => {
  if (item.kind === "game-update") return 2;
  return item.isError ? 0 : 1;
};

export function groupActivity(
  items: ActivityItem[],
  layout: DownloadLayoutState
): ActivityGroups {
  const bySection = (section: ActivitySection) =>
    items.filter((item) => item.section === section);

  const queuedOrder = compareQueuedDownloads(layout);

  const now = bySection("now").sort(
    (a, b) =>
      a.bottomBarPriority - b.bottomBarPriority || a.sortTime - b.sortTime
  );

  const upNext = bySection("upNext").sort((a, b) => {
    if (
      a.source.kind === "game-download" &&
      b.source.kind === "game-download"
    ) {
      return queuedOrder(a.source.game, b.source.game);
    }
    return (
      UP_NEXT_KIND_ORDER[a.kind] - UP_NEXT_KIND_ORDER[b.kind] ||
      a.sortTime - b.sortTime
    );
  });

  const needsYou = bySection("needsYou").sort((a, b) => {
    const rank = needsYouRank(a) - needsYouRank(b);
    if (rank !== 0) return rank;
    if (a.kind === "game-update") return a.title.localeCompare(b.title);
    return b.sortTime - a.sortTime;
  });

  const recent = bySection("recent").sort((a, b) => b.sortTime - a.sortTime);

  return { now, upNext, needsYou, recent };
}

/** The game download shown as the large card: a live download beats an extraction. */
export function selectHero(groups: ActivityGroups): ActivityItem | null {
  const downloads = groups.now.filter((item) => item.kind === "game-download");
  return (
    downloads.find(
      (item) => item.bottomBarPriority !== BOTTOM_BAR_PRIORITY.extraction
    ) ??
    downloads[0] ??
    null
  );
}

export interface BottomBarStatus {
  /** The item named in the bar; null when idle or when `external` is on top. */
  primary: ActivityItem | null;
  /** Work Hydra tracks outside the list (redistributable installs) is on top. */
  external: boolean;
  moreCount: number;
  /** Shown only when nothing is running: the first of Up next. */
  upNext: ActivityItem | null;
  /** Failures and installers waiting for options; updates don't count. */
  attentionCount: number;
}

export function selectBottomBarStatus(
  groups: ActivityGroups,
  options: { external?: boolean } = {}
): BottomBarStatus {
  const external = options.external ?? false;
  const running = groups.now.length + (external ? 1 : 0);

  return {
    primary: external ? null : (groups.now[0] ?? null),
    external,
    moreCount: Math.max(running - 1, 0),
    upNext: running === 0 ? (groups.upNext[0] ?? null) : null,
    attentionCount: groups.needsYou.filter(
      (item) => item.kind !== "game-update"
    ).length,
  };
}
