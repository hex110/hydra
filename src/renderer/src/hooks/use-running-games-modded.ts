import { useEffect, useMemo, useState } from "react";
import type { GameShop } from "@types";

interface RunningGameRef {
  id: string;
  shop: GameShop;
  objectId: string;
}

const NONE: ReadonlySet<string> = new Set();

/** The ids of the running games that were started through Play (modded). */
export function useRunningGamesModded(
  games: readonly RunningGameRef[]
): ReadonlySet<string> {
  const [moddedIds, setModdedIds] = useState<ReadonlySet<string>>(NONE);
  const key = games.map((game) => game.id).join(",");
  // `key` is the identity: a new array with the same games must not refetch.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableGames = useMemo(() => games.slice(), [key]);

  useEffect(() => {
    if (stableGames.length === 0) {
      setModdedIds(NONE);
      return;
    }

    let cancelled = false;
    const setModded = (id: string, modded: boolean) =>
      setModdedIds((current) => {
        if (current.has(id) === modded) return current;
        const next = new Set(current);
        if (modded) next.add(id);
        else next.delete(id);
        return next;
      });

    const load = async (game: RunningGameRef) => {
      try {
        const runs = await window.electron.getGameRuns(
          game.shop,
          game.objectId
        );
        const current = runs.find((run) => run.outcome === "running");
        if (!cancelled) setModded(game.id, current?.mods?.modded === true);
      } catch {
        if (!cancelled) setModded(game.id, false);
      }
    };

    const ids = new Set(stableGames.map((game) => game.id));
    setModdedIds((current) =>
      [...current].every((id) => ids.has(id))
        ? current
        : new Set([...current].filter((id) => ids.has(id)))
    );
    stableGames.forEach((game) => void load(game));

    const stop = window.electron.onGameRunsChanged((shop, objectId) => {
      const changed = stableGames.find(
        (game) => game.shop === shop && game.objectId === objectId
      );
      if (changed) void load(changed);
    });

    return () => {
      cancelled = true;
      stop();
    };
  }, [stableGames]);

  return moddedIds;
}
