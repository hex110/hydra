import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  BackgroundTask,
  DownloadLayoutState,
  LibraryGame,
  ModDownload,
  SteamDownload,
} from "@types";
import { Downloader } from "../../../../shared/constants.js";
import {
  canDismissGameDownload,
  fromBackgroundTask,
  fromGameDownload,
  fromGameUpdate,
  fromModDownload,
  fromSteamDownload,
  groupActivity,
  selectBottomBarStatus,
  selectHero,
} from "./activity.js";

const layout: DownloadLayoutState = {
  version: 1,
  queueOrder: [],
  pausedOrder: [],
};

const text = (title: string) => ({ title, badge: "badge", status: "status" });

const game = (
  id: string,
  download: Record<string, unknown> | null,
  extra: Record<string, unknown> = {}
) =>
  ({
    id: `steam:${id}`,
    shop: "steam",
    objectId: id,
    title: `Game ${id}`,
    libraryImageUrl: `cover-${id}`,
    download: download && {
      shop: "steam",
      objectId: id,
      downloader: Downloader.Torrent,
      progress: 0,
      status: "paused",
      queued: false,
      extracting: false,
      timestamp: 1,
      ...download,
    },
    ...extra,
  }) as unknown as LibraryGame;

const downloadItem = (
  library: LibraryGame,
  options: Partial<Parameters<typeof fromGameDownload>[1]> = {}
) =>
  fromGameDownload(library, {
    ...text(library.title),
    isLive: false,
    isExtractingNow: false,
    isSeeding: false,
    liveProgress: null,
    ...options,
  });

const task = (patch: Partial<BackgroundTask>): BackgroundTask => ({
  id: "floppy-sync",
  state: "running",
  processed: 0,
  total: null,
  result: null,
  dryRun: false,
  error: null,
  updatedAt: 10,
  ...patch,
});

const mod = (patch: Partial<ModDownload>) =>
  ({
    id: "m1",
    shop: "steam",
    objectId: "1",
    gameTitle: "G",
    modName: "M",
    state: "downloading",
    progress: 0.5,
    waitsForOptions: false,
    updatedAt: 5,
    ...patch,
  }) as ModDownload;

const steam = (patch: Partial<SteamDownload>): SteamDownload => ({
  appId: "10",
  title: "S",
  status: "downloading",
  progress: 0.2,
  bytesDone: null,
  bytesTotal: null,
  bytesPerSecond: null,
  ...patch,
});

describe("game downloads", () => {
  it("puts a live download and an extraction in Now", () => {
    const live = downloadItem(game("1", { status: "active" }), {
      isLive: true,
      liveProgress: 0.4,
    });
    assert.equal(live?.section, "now");
    assert.equal(live?.progress, 0.4);

    const extracting = downloadItem(
      game("2", { status: "complete", progress: 1 }),
      { isExtractingNow: true, liveProgress: 0.1 }
    );
    assert.equal(extracting?.section, "now");
    assert.ok(extracting!.bottomBarPriority < live!.bottomBarPriority);
  });

  it("puts queued and paused downloads in Up next", () => {
    assert.equal(
      downloadItem(game("1", { status: "paused", queued: true }))?.section,
      "upNext"
    );
    assert.equal(
      downloadItem(game("1", { status: "paused", progress: 0.3 }))?.section,
      "upNext"
    );
  });

  it("shows an unknown fraction while waiting for debrid", () => {
    const item = downloadItem(
      game("1", {
        status: "paused",
        queued: true,
        awaitingDebrid: true,
        debridAutoResume: true,
        progress: 0.3,
      })
    );
    assert.equal(item?.progress, null);
  });

  it("puts finished downloads in Recent, newest finish first", () => {
    const done = downloadItem(
      game("1", { status: "complete", progress: 1, completedAt: 50 })
    );
    assert.equal(done?.section, "recent");
    assert.equal(done?.sortTime, 50);
    assert.equal(done?.showProgress, false);
  });

  it("puts a failed extraction and an Epic error in Needs you", () => {
    const failed = downloadItem(
      game("1", { status: "complete", progress: 1, extractionFailed: true })
    );
    assert.equal(failed?.section, "needsYou");
    assert.equal(failed?.isError, true);
    assert.equal(failed?.canClear, true);

    const epic = downloadItem(
      game("2", { status: "error", downloader: Downloader.Epic })
    );
    assert.equal(epic?.section, "needsYou");
    assert.equal(epic?.canClear, false);
  });

  it("skips hidden, removed and dismissed downloads", () => {
    assert.equal(downloadItem(game("1", null)), null);
    assert.equal(downloadItem(game("1", { status: "removed" })), null);
    assert.equal(
      downloadItem(game("1", { status: "complete", dismissed: true })),
      null
    );
  });

  it("cannot clear seeding or extracting downloads", () => {
    const finished = game("1", { status: "complete", progress: 1 });
    assert.equal(
      canDismissGameDownload(finished, {
        isSeeding: false,
        isExtractingNow: false,
      }),
      true
    );
    assert.equal(
      canDismissGameDownload(finished, {
        isSeeding: true,
        isExtractingNow: false,
      }),
      false
    );
    assert.equal(
      canDismissGameDownload(finished, {
        isSeeding: false,
        isExtractingNow: true,
      }),
      false
    );
    assert.equal(
      canDismissGameDownload(game("2", { status: "paused", progress: 0.5 }), {
        isSeeding: false,
        isExtractingNow: false,
      }),
      false
    );
  });
});

describe("other sources", () => {
  it("sorts Steam installs by whether they are moving", () => {
    const sections = (
      ["downloading", "finishing", "waiting", "queued", "paused"] as const
    ).map(
      (status) =>
        fromSteamDownload(steam({ status }), {
          ...text("S"),
          coverUrl: null,
        }).section
    );
    assert.deepEqual(sections, ["now", "now", "upNext", "upNext", "upNext"]);
  });

  it("sorts mod downloads by state", () => {
    const section = (patch: Partial<ModDownload>) =>
      fromModDownload(mod(patch), { ...text("M"), coverUrl: null }).section;
    assert.equal(section({ state: "waiting-torbox" }), "now");
    assert.equal(section({ state: "downloading" }), "now");
    assert.equal(section({ state: "installing" }), "now");
    assert.equal(section({ state: "failed" }), "needsYou");
    assert.equal(section({ state: "done", waitsForOptions: true }), "needsYou");
    assert.equal(section({ state: "done" }), "recent");
  });

  it("sorts background tasks by state", () => {
    const section = (state: BackgroundTask["state"]) =>
      fromBackgroundTask(task({ state }), text("T")).section;
    assert.equal(section("running"), "now");
    assert.equal(section("queued"), "upNext");
    assert.equal(section("failed"), "needsYou");
    assert.equal(section("done"), "recent");
  });

  it("shows an indeterminate bar for a task with no total", () => {
    const item = fromBackgroundTask(task({ total: null }), text("T"));
    assert.equal(item.showProgress, true);
    assert.equal(item.progress, null);
    assert.equal(
      fromBackgroundTask(task({ total: 4, processed: 1 }), text("T")).progress,
      0.25
    );
  });

  it("lists updates in Needs you and lets them be ignored", () => {
    const item = fromGameUpdate(game("1", null), text("Game 1"));
    assert.equal(item.section, "needsYou");
    assert.equal(item.canClear, true);
  });
});

describe("groupActivity", () => {
  it("keeps the queue order, then paused order, then oldest first", () => {
    const a = game("a", { status: "paused", queued: true, timestamp: 3 });
    const b = game("b", { status: "paused", queued: true, timestamp: 2 });
    const c = game("c", { status: "paused", queued: true, timestamp: 1 });
    const items = [a, b, c].map((g) => downloadItem(g)!);

    const byTime = groupActivity(items, layout).upNext.map((i) => i.title);
    assert.deepEqual(byTime, ["Game c", "Game b", "Game a"]);

    const ordered = groupActivity(items, {
      ...layout,
      queueOrder: ["steam:a", "steam:b"],
    }).upNext.map((i) => i.title);
    assert.deepEqual(ordered, ["Game a", "Game b", "Game c"]);
  });

  it("puts game downloads before Steam installs and tasks in Up next", () => {
    const items = [
      fromBackgroundTask(task({ state: "queued" }), text("task")),
      fromSteamDownload(steam({ status: "queued" }), {
        ...text("steam"),
        coverUrl: null,
      }),
      downloadItem(game("1", { status: "paused", queued: true }))!,
    ];
    assert.deepEqual(
      groupActivity(items, layout).upNext.map((i) => i.kind),
      ["game-download", "steam-install", "task"]
    );
  });

  it("mixes kinds in Recent by finish time, newest first", () => {
    const items = [
      downloadItem(
        game("1", { status: "complete", progress: 1, completedAt: 20 })
      )!,
      fromBackgroundTask(task({ state: "done", updatedAt: 30 }), text("t")),
      fromModDownload(mod({ state: "done", updatedAt: 10 }), {
        ...text("m"),
        coverUrl: null,
      }),
    ];
    assert.deepEqual(
      groupActivity(items, layout).recent.map((i) => i.kind),
      ["task", "game-download", "mod-download"]
    );
  });

  it("orders Needs you: failures, then waiting installers, then updates by title", () => {
    const items = [
      fromGameUpdate(game("2", null, { title: "Zed" }), text("Zed")),
      fromGameUpdate(game("1", null, { title: "Alpha" }), text("Alpha")),
      fromModDownload(mod({ state: "done", waitsForOptions: true }), {
        ...text("options"),
        coverUrl: null,
      }),
      fromBackgroundTask(task({ state: "failed" }), text("failed")),
    ];
    assert.deepEqual(
      groupActivity(items, layout).needsYou.map((i) => i.title),
      ["failed", "options", "Alpha", "Zed"]
    );
  });

  it("orders Now by bottom bar priority", () => {
    const items = [
      fromBackgroundTask(task({}), text("task")),
      fromModDownload(mod({}), { ...text("mod"), coverUrl: null }),
      fromSteamDownload(steam({}), { ...text("steam"), coverUrl: null }),
      downloadItem(game("1", { status: "active" }), { isLive: true })!,
      downloadItem(game("2", { status: "complete", progress: 1 }), {
        isExtractingNow: true,
      })!,
    ];
    assert.deepEqual(
      groupActivity(items, layout).now.map((i) => i.title),
      ["Game 2", "Game 1", "steam", "mod", "task"]
    );
  });

  it("picks a live download over an extraction as the hero", () => {
    const groups = groupActivity(
      [
        downloadItem(game("1", { status: "active" }), { isLive: true })!,
        downloadItem(game("2", { status: "complete", progress: 1 }), {
          isExtractingNow: true,
        })!,
      ],
      layout
    );
    assert.equal(selectHero(groups)?.title, "Game 1");
    assert.equal(selectHero({ ...groups, now: [] }), null);
  });
});

describe("selectBottomBarStatus", () => {
  it("names the highest-priority item and counts the rest", () => {
    const groups = groupActivity(
      [
        fromBackgroundTask(task({}), text("task")),
        downloadItem(game("1", { status: "active" }), { isLive: true })!,
      ],
      layout
    );
    const status = selectBottomBarStatus(groups);
    assert.equal(status.primary?.title, "Game 1");
    assert.equal(status.moreCount, 1);
    assert.equal(status.upNext, null);
  });

  it("names a running task when nothing else is going", () => {
    const groups = groupActivity(
      [fromBackgroundTask(task({}), text("Floppy"))],
      layout
    );
    const status = selectBottomBarStatus(groups);
    assert.equal(status.primary?.title, "Floppy");
    assert.equal(status.moreCount, 0);
  });

  it("puts external work on top and counts everything else as more", () => {
    const groups = groupActivity(
      [fromBackgroundTask(task({}), text("Floppy"))],
      layout
    );
    const status = selectBottomBarStatus(groups, { external: true });
    assert.equal(status.primary, null);
    assert.equal(status.external, true);
    assert.equal(status.moreCount, 1);
  });

  it("falls back to the first queued item when idle", () => {
    const groups = groupActivity(
      [downloadItem(game("1", { status: "paused", queued: true }))!],
      layout
    );
    const status = selectBottomBarStatus(groups);
    assert.equal(status.primary, null);
    assert.equal(status.upNext?.title, "Game 1");
  });

  it("counts failures and waiting installers but not updates", () => {
    const groups = groupActivity(
      [
        fromGameUpdate(game("1", null), text("update")),
        fromBackgroundTask(task({ state: "failed" }), text("failed")),
        fromModDownload(mod({ state: "done", waitsForOptions: true }), {
          ...text("options"),
          coverUrl: null,
        }),
      ],
      layout
    );
    const status = selectBottomBarStatus(groups);
    assert.equal(status.attentionCount, 2);
    assert.equal(status.primary, null);
    assert.equal(status.upNext, null);
  });
});
