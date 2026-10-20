import {
  getGameGenres,
  type LibraryFilterableGame,
} from "./library-filters.js";

type PlayStatusKey = "playing" | "backlog" | "finished" | "dropped" | "none";

export interface PlayActivityDayEntry {
  date: string;
  games: Record<string, number>;
}

export interface LibraryStats {
  gameCount: number;
  installedCount: number;
  playedCount: number;
  totalPlayTime: number;
  statusCounts: Record<PlayStatusKey, number>;
  /** Finished games out of the games played at all, 0–1; null with none played. */
  completionRate: number | null;
  /** Playtime per genre, most first; a game counts for each of its genres. */
  playTimeByGenre: { genre: string; playTime: number }[];
  mostPlayed: { title: string; playTime: number }[];
}

const playTimeOf = (game: LibraryFilterableGame) =>
  (game.playTimeInMilliseconds ?? 0) +
  (game.steamPlayTimeInMilliseconds ?? 0) +
  (game.epicPlayTimeInMilliseconds ?? 0);

export const getLibraryStats = <T extends LibraryFilterableGame>(
  games: T[],
  isInstalled: (game: T) => boolean,
  topCount = 8
): LibraryStats => {
  const statusCounts: Record<PlayStatusKey, number> = {
    playing: 0,
    backlog: 0,
    finished: 0,
    dropped: 0,
    none: 0,
  };
  const byGenre = new Map<string, number>();
  let installedCount = 0;
  let playedCount = 0;
  let finishedPlayed = 0;
  let totalPlayTime = 0;

  for (const game of games) {
    const playTime = playTimeOf(game);
    statusCounts[game.playStatus ?? "none"]++;
    if (isInstalled(game)) installedCount++;
    if (playTime > 0 || game.playStatus === "finished") {
      playedCount++;
      if (game.playStatus === "finished") finishedPlayed++;
    }
    totalPlayTime += playTime;
    if (playTime > 0) {
      for (const genre of getGameGenres(game)) {
        byGenre.set(genre, (byGenre.get(genre) ?? 0) + playTime);
      }
    }
  }

  return {
    gameCount: games.length,
    installedCount,
    playedCount,
    totalPlayTime,
    statusCounts,
    completionRate: playedCount > 0 ? finishedPlayed / playedCount : null,
    playTimeByGenre: [...byGenre.entries()]
      .map(([genre, playTime]) => ({ genre, playTime }))
      .sort((a, b) => b.playTime - a.playTime)
      .slice(0, topCount),
    mostPlayed: games
      .map((game) => ({ title: game.title ?? "", playTime: playTimeOf(game) }))
      .filter((game) => game.playTime > 0)
      .sort((a, b) => b.playTime - a.playTime)
      .slice(0, topCount),
  };
};

/** Recorded play per month (`YYYY-MM`) for the last `months`, oldest first. */
export const getPlayTimeByMonth = (
  entries: readonly PlayActivityDayEntry[],
  today: Date,
  months = 12
): { month: string; playTime: number }[] => {
  const result: { month: string; playTime: number }[] = [];
  for (let offset = months - 1; offset >= 0; offset--) {
    const date = new Date(today.getFullYear(), today.getMonth() - offset, 1);
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    result.push({ month, playTime: 0 });
  }

  const index = new Map(result.map((item, i) => [item.month, i]));
  for (const entry of entries) {
    const i = index.get(entry.date.slice(0, 7));
    if (i === undefined) continue;
    result[i].playTime += Object.values(entry.games).reduce(
      (sum, ms) => sum + ms,
      0
    );
  }
  return result;
};
