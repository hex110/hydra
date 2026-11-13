import { useEffect, useState } from "react";
import type { LibraryGame, SteamLaunchOptionInfo } from "@types";

/**
 * The ways Steam can start this game (Play, Play in VR, ...). Empty for games
 * that are not installed through Steam and for games with a single way.
 */
export function useSteamLaunchOptions(
  game: Pick<LibraryGame, "shop" | "objectId" | "executablePath"> | null
) {
  const [options, setOptions] = useState<SteamLaunchOptionInfo[]>([]);
  const appId =
    game?.shop === "steam" && game.executablePath ? game.objectId : null;
  const executablePath = game?.executablePath;

  useEffect(() => {
    if (!appId) {
      setOptions([]);
      return;
    }

    let cancelled = false;
    window.electron
      .getSteamLaunchOptions(appId)
      .then((found) => {
        if (!cancelled) setOptions(found);
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      });

    return () => {
      cancelled = true;
    };
  }, [appId, executablePath]);

  return options;
}
