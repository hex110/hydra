import {
  db,
  gamesSublevel,
  levelKeys,
  steamHistorySublevel,
} from "@main/level";
import { toPlayActivityDate } from "@shared";
import type {
  SteamGameHistory,
  SteamHistorySyncStatus,
  UserPreferences,
} from "@types";

import { updateGameRecord } from "../game-record-updater";
import { queueFloppySync } from "../floppy";
import { logger } from "../logger";
import { getPlayActivity, recordPlayActivity } from "../play-activity";
import { WindowManager } from "../window-manager";
import {
  fetchAchievementSchema,
  fetchOwnedGames,
  fetchPlayerAchievements,
  type SteamHistoryCredentials,
} from "./steam-history-api";
import {
  mergeAchievements,
  needsAchievementFetch,
  steamActivityToRecord,
  steamPlayTimeToStore,
  toHistoryEntry,
  type SteamOwnedGame,
} from "./steam-history-core";

const CONCURRENCY = 4;
const SYNC_INTERVAL_MS = 6 * 3_600_000;
const SYNC_STARTUP_DELAY_MS = 90_000;

const idle: SteamHistorySyncStatus = {
  running: false,
  total: 0,
  processed: 0,
  activityDays: 0,
  gamesWithAchievements: 0,
  error: null,
  finishedAt: null,
};
let status: SteamHistorySyncStatus = idle;

export const getSteamHistorySyncStatus = () => status;

export const getSteamHistoryCredentials =
  async (): Promise<SteamHistoryCredentials | null> => {
    const preferences = await db
      .get<string, UserPreferences | null>(levelKeys.userPreferences, {
        valueEncoding: "json",
      })
      .catch(() => null);

    if (!preferences?.steamHistoryApiKey || !preferences.steamHistorySteamId) {
      return null;
    }
    return {
      apiKey: preferences.steamHistoryApiKey,
      steamId: preferences.steamHistorySteamId,
    };
  };

export const getSteamGameHistory = (appId: string) =>
  steamHistorySublevel.get(appId).catch(() => null);

/** Hydra's own play per game since each date, so Steam's share is not counted twice. */
const loadHydraPlay = async (previous: Map<string, SteamGameHistory>) => {
  const syncedAt = [...previous.values()].map((entry) => entry.syncedAt);
  if (syncedAt.length === 0) return () => 0;

  const since = toPlayActivityDate(new Date(Math.min(...syncedAt)));
  const days = await getPlayActivity(since);

  return (appId: string, sinceMs: number) => {
    const sinceDate = toPlayActivityDate(new Date(sinceMs));
    const key = levelKeys.game("steam", appId);
    return days
      .filter((day) => day.date >= sinceDate)
      .reduce((total, day) => total + (day.games[key] ?? 0), 0);
  };
};

const syncOne = async (
  credentials: SteamHistoryCredentials,
  game: SteamOwnedGame,
  previous: SteamGameHistory | null,
  hydraPlay: (appId: string, sinceMs: number) => number,
  now: number
) => {
  const appId = String(game.appid);
  const entry = toHistoryEntry(game, previous, now);

  if (needsAchievementFetch(game, previous)) {
    const player = await fetchPlayerAchievements(credentials, appId);
    if (player) {
      const needsNames = !previous?.achievements?.some((a) => a.displayName);
      const schema = needsNames
        ? await fetchAchievementSchema(credentials, appId)
        : [];
      const merged = mergeAchievements(player, schema);

      entry.achievements = needsNames
        ? merged
        : merged.map((item) => ({
            ...item,
            displayName:
              previous?.achievements?.find((p) => p.apiName === item.apiName)
                ?.displayName ?? null,
            description:
              previous?.achievements?.find((p) => p.apiName === item.apiName)
                ?.description ?? null,
          }));
    }
  }

  const toRecord = steamActivityToRecord({
    previous,
    current: entry,
    hydraMsSincePrevious: previous ? hydraPlay(appId, previous.syncedAt) : 0,
  });
  if (toRecord) {
    await recordPlayActivity(
      levelKeys.game("steam", appId),
      toRecord.milliseconds,
      toRecord.at
    );
  }

  await steamHistorySublevel.put(appId, entry);
  await applyToLibraryGame(entry);

  return { recorded: toRecord !== null, hasAchievements: !!entry.achievements };
};

const applyToLibraryGame = async (entry: SteamGameHistory) => {
  const key = levelKeys.game("steam", entry.appId);
  const game = await gamesSublevel.get(key).catch(() => null);
  if (!game || game.isDeleted) return;

  const lastPlayed = entry.lastPlayedAt ? entry.lastPlayedAt * 1000 : null;
  const currentLast = game.lastTimePlayed
    ? new Date(game.lastTimePlayed).getTime()
    : 0;
  const steamPlayTime = steamPlayTimeToStore(
    entry.playtimeMinutes,
    game.playTimeInMilliseconds ?? 0
  );

  if (
    steamPlayTime === (game.steamPlayTimeInMilliseconds ?? 0) &&
    (lastPlayed === null || lastPlayed <= currentLast)
  ) {
    return;
  }

  await updateGameRecord(key, {
    steamPlayTimeInMilliseconds: steamPlayTime,
    ...(lastPlayed !== null && lastPlayed > currentLast
      ? { lastTimePlayed: new Date(lastPlayed) }
      : {}),
  });
  queueFloppySync("steam", entry.appId, "playtime");
};

const run = async (credentials: SteamHistoryCredentials) => {
  const owned = await fetchOwnedGames(credentials);
  const stored = await steamHistorySublevel.values().all();
  const previous = new Map(stored.map((entry) => [entry.appId, entry]));
  const hydraPlay = await loadHydraPlay(previous);
  const now = Date.now();

  status = { ...status, total: owned.length };

  let next = 0;
  const worker = async () => {
    while (next < owned.length) {
      const game = owned[next++];

      try {
        const result = await syncOne(
          credentials,
          game,
          previous.get(String(game.appid)) ?? null,
          hydraPlay,
          now
        );
        status = {
          ...status,
          activityDays: status.activityDays + (result.recorded ? 1 : 0),
          gamesWithAchievements:
            status.gamesWithAchievements + (result.hasAchievements ? 1 : 0),
        };
      } catch (error) {
        logger.error("Steam history sync failed for a game", {
          appId: game.appid,
          error,
        });
      }

      status = { ...status, processed: status.processed + 1 };
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
};

/** Runs in the background; poll `getSteamHistorySyncStatus`. */
export const startSteamHistorySync = async () => {
  if (status.running) return status;

  const credentials = await getSteamHistoryCredentials();
  if (!credentials) throw new Error("steam-history-not-configured");

  status = { ...idle, running: true };

  void run(credentials)
    .then(() => {
      status = { ...status, running: false, finishedAt: Date.now() };
      WindowManager.sendToAppWindows("on-library-batch-complete");
    })
    .catch((error: unknown) => {
      logger.error("Steam history sync failed", error);
      status = {
        ...status,
        running: false,
        error: error instanceof Error ? error.message : String(error),
      };
    });

  return status;
};

let timer: NodeJS.Timeout | null = null;

export const startSteamHistorySchedule = () => {
  if (timer) return;

  const tick = () => {
    startSteamHistorySync().catch((error: unknown) => {
      if (
        error instanceof Error &&
        error.message === "steam-history-not-configured"
      )
        return;
      logger.error("Steam history sync failed to start", error);
    });
  };

  setTimeout(tick, SYNC_STARTUP_DELAY_MS);
  timer = setInterval(tick, SYNC_INTERVAL_MS);
};
