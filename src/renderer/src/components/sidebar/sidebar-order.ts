import type { LibraryGame } from "@types";
import { getLibraryGameMembers } from "../../../../shared/library-catalogue.js";

/**
 * The games that are running, newest start first. The watcher stamps every
 * running game's last-played time each tick, so that time can't say which
 * one was started last; the running list is in start order.
 */
export const orderRunningGames = (
  games: readonly LibraryGame[],
  runningGameIds: readonly string[]
): LibraryGame[] => {
  const startRank = (game: LibraryGame) =>
    Math.max(
      ...getLibraryGameMembers(game).map((member) =>
        runningGameIds.indexOf(member.id)
      )
    );

  return games
    .filter((game) => startRank(game) >= 0)
    .sort((a, b) => startRank(b) - startRank(a));
};
