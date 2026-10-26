import {
  db,
  gamesSublevel,
  levelKeys,
  steamHistorySublevel,
} from "@main/level";
import { getDisplayedPlayTimeInMilliseconds } from "@shared";
import type {
  FloppyBackfillReport,
  FloppyGameChange,
  FloppyPullResult,
  FloppySyncStatus,
  Game,
  GameShop,
  UserPreferences,
} from "@types";

import { logger } from "../logger";
import { updateGameRecord } from "../game-record-updater";
import { firstUnlockTime } from "../steam-history/steam-history-core";
import {
  removeBackgroundTask,
  updateBackgroundTask,
} from "../background-tasks";
import { WindowManager } from "../window-manager";
import { FloppyClient } from "./floppy-client";
import {
  normalizeTitle,
  pickMatch,
  planPatch,
  planPull,
  type FloppyPatch,
  type FloppySyncReason,
} from "./floppy-sync-core";

const DEBOUNCE_MS = 10_000;

const pending = new Map<
  string,
  { timer: NodeJS.Timeout; reason: FloppySyncReason }
>();
const unmatchedThisSession = new Set<string>();

export const getFloppyClient = async () => {
  const preferences = await db
    .get<string, UserPreferences | null>(levelKeys.userPreferences, {
      valueEncoding: "json",
    })
    .catch(() => null);

  if (!preferences?.floppyEnabled) return null;
  if (!preferences.floppyUrl || !preferences.floppyApiToken) return null;

  return new FloppyClient({
    url: preferences.floppyUrl,
    token: preferences.floppyApiToken,
  });
};

const resolveMediaId = async (client: FloppyClient, game: Game) => {
  if (game.floppyMediaId) return game.floppyMediaId;

  const key = levelKeys.game(game.shop, game.objectId);
  if (unmatchedThisSession.has(key)) return null;

  const match = pickMatch(game.title, await client.searchGame(game.title));
  if (!match) {
    unmatchedThisSession.add(key);
    return null;
  }

  const mediaId = String(match.media_id);
  await updateGameRecord(key, { floppyMediaId: mediaId });
  return mediaId;
};

/** Playtime from every source, and the dates Steam's history can vouch for. */
const withHistory = async (game: Game) => {
  const history =
    game.shop === "steam"
      ? await steamHistorySublevel.get(game.objectId).catch(() => null)
      : null;
  const firstUnlock = history ? firstUnlockTime(history) : null;

  return {
    ...game,
    playTimeInMilliseconds: getDisplayedPlayTimeInMilliseconds(game),
    startedAt: firstUnlock ? new Date(firstUnlock * 1000) : null,
    lastPlayedAt: history?.lastPlayedAt
      ? new Date(history.lastPlayedAt * 1000)
      : null,
  };
};

type SyncResult =
  | { outcome: "unchanged" | "unmatched" }
  | { outcome: "created" | "updated"; change: FloppyGameChange };

const syncGame = async (
  client: FloppyClient,
  game: Game,
  reason: FloppySyncReason,
  dryRun = false
): Promise<SyncResult> => {
  const mediaId = game.floppyMediaId ?? (await resolveMediaId(client, game));
  if (!mediaId) return { outcome: "unmatched" };

  const state = await client.getState(mediaId);
  const patch: FloppyPatch = planPatch(await withHistory(game), state, reason);
  const change: FloppyGameChange = {
    title: game.title,
    action: state.tracked ? "update" : "create",
    fromStatus: state.tracked ? state.status : null,
    toStatus: patch.status ?? (state.tracked ? state.status : null),
    fromMinutes: state.progress,
    toMinutes: patch.progress ?? state.progress,
  };

  if (!state.tracked) {
    if (patch.status === undefined) return { outcome: "unchanged" };
    if (!dryRun)
      await client.track(mediaId, {
        status: patch.status,
        progress: patch.progress,
        score: patch.score,
        start_date: patch.start_date,
        end_date: patch.end_date,
      });
    return { outcome: "created", change };
  }

  if (Object.keys(patch).length === 0) return { outcome: "unchanged" };

  if (!dryRun) await client.update(mediaId, patch);
  return { outcome: "updated", change };
};

const runQueued = async (key: string, reason: FloppySyncReason) => {
  const client = await getFloppyClient();
  if (!client) return;

  const game = await gamesSublevel.get(key).catch(() => null);
  if (!game || game.shop === "launchbox") return;

  try {
    await syncGame(client, game, reason);
  } catch (error) {
    logger.error("Failed to sync game to Floppy", { key, error });
  }
};

const runQueuedWishlist = async (key: string) => {
  const client = await getFloppyClient();
  if (!client) return;

  const game = await gamesSublevel.get(key).catch(() => null);
  if (!game || game.shop === "launchbox") return;

  try {
    const mediaId = await resolveMediaId(client, game);
    if (!mediaId) return;

    const wishlisted = game.wishlisted === true;
    const listId = await client.getWishlistId(wishlisted);
    if (listId !== null)
      await client.setWishlisted(mediaId, listId, wishlisted);
  } catch (error) {
    logger.error("Failed to sync the Floppy wishlist", { key, error });
  }
};

// An explicit change must not be downgraded by a later playtime sync.
const REASON_PRIORITY: Record<FloppySyncReason, number> = {
  playtime: 0,
  backfill: 0,
  rating: 1,
  status: 2,
};

const syncPushTask = () => {
  if (pending.size === 0) removeBackgroundTask("floppy-push");
  else
    updateBackgroundTask("floppy-push", {
      state: "queued",
      total: pending.size,
      processed: 0,
    });
};

const schedule = (
  key: string,
  reason: FloppySyncReason | "wishlist",
  run: (effective: FloppySyncReason) => Promise<void>
) => {
  const slot = `${reason === "wishlist" ? "w" : "g"}:${key}`;
  const existing = pending.get(slot);
  if (existing) clearTimeout(existing.timer);

  const effective =
    reason === "wishlist"
      ? "playtime"
      : existing && REASON_PRIORITY[existing.reason] > REASON_PRIORITY[reason]
        ? existing.reason
        : reason;
  const timer = setTimeout(() => {
    pending.delete(slot);
    syncPushTask();
    void run(effective);
  }, DEBOUNCE_MS);

  pending.set(slot, { timer, reason: effective });
  syncPushTask();
};

export const queueFloppySync = (
  shop: GameShop,
  objectId: string,
  reason: FloppySyncReason | "wishlist"
) => {
  const key = levelKeys.game(shop, objectId);

  if (reason === "wishlist") {
    schedule(key, reason, () => runQueuedWishlist(key));
    return;
  }

  schedule(key, reason, (effective) => runQueued(key, effective));
};

const hasPendingFloppyChange = (key: string) =>
  pending.has(`g:${key}`) || pending.has(`w:${key}`);

/** Brings status, rating and wishlist from Floppy into Hydra. */
const runPull = async (): Promise<FloppyPullResult> => {
  const client = await getFloppyClient();
  if (!client) throw new Error("floppy-not-configured");

  const [entries, wishlistId, games] = await Promise.all([
    client.listGames(),
    client.getWishlistId(false),
    gamesSublevel.values().all(),
  ]);
  const wishlist =
    wishlistId === null
      ? new Set<string>()
      : await client.listWishlistMediaIds(wishlistId);

  const byId = new Map(entries.map((entry) => [entry.mediaId, entry]));
  const byTitle = new Map<string, string | null>();
  for (const entry of entries) {
    const title = normalizeTitle(entry.title);
    // Two entries with one title (remaster, other platform) are ambiguous.
    byTitle.set(title, byTitle.has(title) ? null : entry.mediaId);
  }

  const result: FloppyPullResult = {
    total: games.length,
    matched: 0,
    updated: 0,
  };

  for (const game of games) {
    if (game.isDeleted || game.shop === "launchbox") continue;

    const key = levelKeys.game(game.shop, game.objectId);
    const mediaId =
      game.floppyMediaId ?? byTitle.get(normalizeTitle(game.title)) ?? null;
    const entry = mediaId ? byId.get(mediaId) : undefined;
    if (!mediaId || !entry) continue;
    result.matched += 1;

    // A change made in Hydra a moment ago has not reached Floppy yet.
    if (hasPendingFloppyChange(key)) continue;

    const change = planPull(game, entry, wishlist.has(mediaId));
    const matchChanged = game.floppyMediaId !== mediaId;
    if (Object.keys(change).length === 0 && !matchChanged) continue;

    await updateGameRecord(key, {
      ...change,
      ...(matchChanged ? { floppyMediaId: mediaId } : {}),
    });
    if (Object.keys(change).length > 0) result.updated += 1;
  }

  if (result.updated > 0) {
    WindowManager.sendToAppWindows("on-library-batch-complete");
  }
  return result;
};

/** A scheduled pull (`quiet`) leaves nothing on the Downloads page if it changed nothing. */
export const pullFromFloppy = async (
  quiet = false
): Promise<FloppyPullResult> => {
  if (!(await getFloppyClient())) throw new Error("floppy-not-configured");

  updateBackgroundTask("floppy-pull", {
    state: "running",
    processed: 0,
    total: null,
    result: null,
  });

  try {
    const result = await runPull();

    if (quiet && result.updated === 0) removeBackgroundTask("floppy-pull");
    else
      updateBackgroundTask("floppy-pull", {
        state: "done",
        processed: result.total,
        total: result.total,
        result: { matched: result.matched, updated: result.updated },
      });

    return result;
  } catch (error) {
    updateBackgroundTask("floppy-pull", { state: "failed" });
    throw error;
  }
};

const PULL_INTERVAL_MS = 30 * 60_000;
const PULL_STARTUP_DELAY_MS = 60_000;
let pullTimer: NodeJS.Timeout | null = null;

export const startFloppyPullSchedule = () => {
  if (pullTimer) return;

  const run = () =>
    pullFromFloppy(true).catch((error: unknown) => {
      // Not configured is the normal state for most users.
      if (error instanceof Error && error.message === "floppy-not-configured")
        return;
      logger.error("Failed to pull from Floppy", error);
    });

  setTimeout(() => void run(), PULL_STARTUP_DELAY_MS);
  pullTimer = setInterval(() => void run(), PULL_INTERVAL_MS);
};

const BACKFILL_CONCURRENCY = 4;

const idleStatus: FloppySyncStatus = {
  running: false,
  dryRun: false,
  total: 0,
  processed: 0,
  report: null,
  error: null,
};
let syncStatus: FloppySyncStatus = idleStatus;

export const getFloppySyncStatus = () => syncStatus;

const runBackfill = async (client: FloppyClient, dryRun: boolean) => {
  const games = (await gamesSublevel.values().all()).filter(
    (game) => !game.isDeleted && game.shop !== "launchbox"
  );
  const report: FloppyBackfillReport = {
    dryRun,
    total: games.length,
    created: 0,
    updated: 0,
    unchanged: 0,
    changes: [],
    unmatched: [],
    failed: 0,
  };
  syncStatus = { ...syncStatus, total: games.length };
  updateBackgroundTask("floppy-sync", { total: games.length });

  let next = 0;
  const worker = async () => {
    while (next < games.length) {
      const game = games[next++];

      try {
        const result = await syncGame(client, game, "backfill", dryRun);
        if (result.outcome === "unmatched") report.unmatched.push(game.title);
        else report[result.outcome] += 1;
        if ("change" in result) report.changes.push(result.change);
      } catch (error) {
        report.failed += 1;
        logger.error("Floppy backfill failed for a game", {
          title: game.title,
          error,
        });
      }

      syncStatus = { ...syncStatus, processed: syncStatus.processed + 1 };
      updateBackgroundTask("floppy-sync", { processed: syncStatus.processed });
    }
  };

  await Promise.all(Array.from({ length: BACKFILL_CONCURRENCY }, worker));
  return report;
};

/** Starts the library sync in the background; poll `getFloppySyncStatus`. */
export const startFloppyLibrarySync = async (dryRun: boolean) => {
  if (syncStatus.running) return syncStatus;

  const client = await getFloppyClient();
  if (!client) throw new Error("floppy-not-configured");

  syncStatus = { ...idleStatus, running: true, dryRun };
  updateBackgroundTask("floppy-sync", {
    state: "running",
    processed: 0,
    total: null,
    result: null,
    dryRun,
  });

  void runBackfill(client, dryRun)
    .then((report) => {
      syncStatus = { ...syncStatus, running: false, report };
      updateBackgroundTask("floppy-sync", {
        state: "done",
        processed: report.total,
        total: report.total,
        dryRun,
        result: {
          created: report.created,
          updated: report.updated,
          unchanged: report.unchanged,
          unmatched: report.unmatched.length,
          failed: report.failed,
        },
      });
    })
    .catch((error: unknown) => {
      logger.error("Floppy library sync failed", error);
      updateBackgroundTask("floppy-sync", { state: "failed" });
      syncStatus = {
        ...syncStatus,
        running: false,
        error: error instanceof Error ? error.message : String(error),
      };
    });

  return syncStatus;
};
