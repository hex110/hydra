import { useCallback, useEffect, useState } from "react";

import { logger } from "@renderer/logger";
import type { GameMods, GameShop, ModDownload } from "@types";

/**
 * A game's mods, reloaded whenever its activity log grows (every change is
 * logged) or a game's run state changes.
 */
export function useGameMods(
  shop: GameShop | null | undefined,
  objectId: string | null | undefined,
  enabled = true
) {
  const [gameMods, setGameMods] = useState<GameMods | null>(null);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled || !shop || !objectId) return;
    try {
      setGameMods(await window.electron.getGameMods(shop, objectId));
      setError(false);
    } catch (cause) {
      logger.error("Failed to load mods", cause);
      setError(true);
    }
  }, [enabled, shop, objectId]);

  useEffect(() => {
    setGameMods(null);
    void refresh();
    if (!enabled) return;
    return window.electron.onModActivityChanged((changedShop, changedId) => {
      if (changedShop === shop && changedId === objectId) void refresh();
    });
  }, [enabled, shop, objectId, refresh]);

  return { gameMods, error, refresh };
}

/** The mod downloads in the Downloads queue, live. */
export function useModDownloads() {
  const [downloads, setDownloads] = useState<ModDownload[]>([]);

  useEffect(() => {
    window.electron
      .getModDownloads()
      .then(setDownloads)
      .catch((error) => logger.error("Failed to load mod downloads", error));
    return window.electron.onModDownloadsChanged(setDownloads);
  }, []);

  return downloads;
}
