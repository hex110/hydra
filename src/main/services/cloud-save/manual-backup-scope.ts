import type { Game, ManualSaveBackupScope } from "@types";

const DAY_MS = 24 * 60 * 60_000;

type ScopedGame = Pick<
  Game,
  | "shop"
  | "objectId"
  | "title"
  | "isDeleted"
  | "lastTimePlayed"
  | "playTimeInMilliseconds"
>;

const toMs = (value: Date | string | null | undefined) => {
  const ms = value ? new Date(value).getTime() : 0;
  return Number.isFinite(ms) ? ms : 0;
};

/**
 * The games a manual backup covers. "Launched" means this device tracked play
 * time: the last-played date also moves when another device syncs one in, which
 * says nothing about the saves here.
 */
export const selectGamesForBackup = <T extends ScopedGame>(
  games: T[],
  scope: ManualSaveBackupScope,
  now = Date.now()
): T[] => {
  const inLibrary = games.filter(
    (game) => !game.isDeleted && game.shop !== "custom"
  );
  if (scope.kind === "all") return inLibrary;

  const launched = inLibrary.filter((game) => game.playTimeInMilliseconds > 0);
  if (scope.kind === "launched") return launched;

  const since = now - Math.max(1, Math.floor(scope.days)) * DAY_MS;
  return launched.filter((game) => toMs(game.lastTimePlayed) >= since);
};
