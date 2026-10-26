import { db, gamesSublevel, levelKeys } from "@main/level";
import type {
  FloppyBackfillReport,
  Game,
  GameShop,
  UserPreferences,
} from "@types";

import { logger } from "../logger";
import { updateGameRecord } from "../game-record-updater";
import { FloppyClient } from "./floppy-client";
import {
  pickMatch,
  planPatch,
  type FloppyPatch,
  type FloppySyncReason,
} from "./floppy-sync-core";

const DEBOUNCE_MS = 10_000;

const pending = new Map<
  string,
  { timer: NodeJS.Timeout; reason: FloppySyncReason }
>();
const unmatchedThisSession = new Set<string>();
let backfillRunning = false;

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

type SyncOutcome = "created" | "updated" | "unchanged" | "unmatched";

const syncGame = async (
  client: FloppyClient,
  game: Game,
  reason: FloppySyncReason,
  dryRun = false
): Promise<SyncOutcome> => {
  const mediaId = game.floppyMediaId ?? (await resolveMediaId(client, game));
  if (!mediaId) return "unmatched";

  const state = await client.getState(mediaId);
  const patch: FloppyPatch = planPatch(game, state, reason);

  if (!state.tracked) {
    if (patch.status === undefined) return "unchanged";
    if (!dryRun)
      await client.track(mediaId, {
        status: patch.status,
        progress: patch.progress,
      });
    return "created";
  }

  if (patch.status === undefined && patch.progress === undefined) {
    return "unchanged";
  }

  if (!dryRun) await client.update(mediaId, patch);
  return "updated";
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

export const queueFloppySync = (
  shop: GameShop,
  objectId: string,
  reason: FloppySyncReason
) => {
  const key = levelKeys.game(shop, objectId);
  const existing = pending.get(key);
  if (existing) clearTimeout(existing.timer);

  // A status change must not be downgraded by a later playtime sync.
  const effective = existing?.reason === "status" ? "status" : reason;
  const timer = setTimeout(() => {
    pending.delete(key);
    void runQueued(key, effective);
  }, DEBOUNCE_MS);

  pending.set(key, { timer, reason: effective });
};

export const backfillFloppyLibrary = async (
  dryRun: boolean
): Promise<FloppyBackfillReport> => {
  const client = await getFloppyClient();
  if (!client) throw new Error("floppy-not-configured");
  if (backfillRunning) throw new Error("floppy-backfill-running");

  backfillRunning = true;
  const report: FloppyBackfillReport = {
    dryRun,
    total: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    unmatched: [],
    failed: 0,
  };

  try {
    const games = (await gamesSublevel.values().all()).filter(
      (game) => !game.isDeleted && game.shop !== "launchbox"
    );
    report.total = games.length;

    for (const game of games) {
      try {
        const outcome = await syncGame(client, game, "backfill", dryRun);
        if (outcome === "unmatched") report.unmatched.push(game.title);
        else report[outcome] += 1;
      } catch (error) {
        report.failed += 1;
        logger.error("Floppy backfill failed for a game", {
          title: game.title,
          error,
        });
      }
    }

    return report;
  } finally {
    backfillRunning = false;
  }
};
