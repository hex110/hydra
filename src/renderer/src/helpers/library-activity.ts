import type { LibraryGame } from "@types";

const toTime = (value: Date | string | null | undefined): number | null => {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
};

/** Starting a download, finishing it, installing or playing a game counts as activity; adding it does not. */
export const getLastActivityTime = (game: LibraryGame): number | null =>
  Math.max(
    toTime(game.lastTimePlayed) ?? 0,
    toTime(game.installedAt) ?? 0,
    toTime(game.downloadStartedAt) ?? 0,
    game.download?.timestamp ?? 0,
    game.download?.completedAt ?? 0
  ) || null;
