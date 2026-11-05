import { useEffect, useState } from "react";
import type { GameRunning } from "@types";

/** Whether the game now running was started through Play (modded). */
export function useRunningGameModded(
  game: Pick<GameRunning, "shop" | "objectId"> | null
) {
  const [modded, setModded] = useState(false);
  const shop = game?.shop;
  const objectId = game?.objectId;

  useEffect(() => {
    if (!shop || !objectId) {
      setModded(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const runs = await window.electron.getGameRuns(shop, objectId);
        const current = runs.find((run) => run.outcome === "running");
        if (!cancelled) setModded(current?.mods?.modded === true);
      } catch {
        if (!cancelled) setModded(false);
      }
    };

    void load();
    const stop = window.electron.onGameRunsChanged((changedShop, changedId) => {
      if (changedShop === shop && changedId === objectId) void load();
    });

    return () => {
      cancelled = true;
      stop();
    };
  }, [shop, objectId]);

  return modded;
}
