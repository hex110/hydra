import { useEffect, useMemo, useState } from "react";
import type { LibraryGame, OtherDeviceRecentGame } from "@types";
import { logger } from "@renderer/logger";

export interface OtherDeviceGame {
  game: LibraryGame;
  hostname: string | null;
  lastTimePlayed: string;
}

const SAME_PLAY_MS = 60_000;

/**
 * Library games whose latest play was on another device (from library sync),
 * newest first. A game played here since then is left out: it is in Continue
 * playing already.
 */
export function useOtherDeviceGames(
  library: (LibraryGame & { members?: LibraryGame[] })[],
  exclude: LibraryGame | undefined
): OtherDeviceGame[] {
  const [recent, setRecent] = useState<OtherDeviceRecentGame[]>([]);

  useEffect(() => {
    let cancelled = false;
    window.electron
      .listOtherDeviceRecentGames()
      .then((games) => {
        if (!cancelled) setRecent(games);
      })
      .catch((error) =>
        logger.error("Failed to read other devices' recent games", error)
      );
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => {
    const result: OtherDeviceGame[] = [];
    const seen = new Set<string>();
    for (const entry of recent) {
      const game = library.find((candidate) =>
        (candidate.members?.length ? candidate.members : [candidate]).some(
          (member) =>
            member.shop === entry.shop && member.objectId === entry.objectId
        )
      );
      if (!game || game.id === exclude?.id || seen.has(game.id)) continue;
      const localPlay = game.lastTimePlayed
        ? new Date(game.lastTimePlayed).getTime()
        : 0;
      if (localPlay > new Date(entry.lastTimePlayed).getTime() + SAME_PLAY_MS)
        continue;
      seen.add(game.id);
      result.push({
        game,
        hostname: entry.hostname,
        lastTimePlayed: entry.lastTimePlayed,
      });
    }
    return result.slice(0, 12);
  }, [recent, library, exclude]);
}
