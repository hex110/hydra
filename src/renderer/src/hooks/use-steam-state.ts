import { useEffect, useState } from "react";
import type { SteamState } from "@types";
import { logger } from "@renderer/logger";

/** Whether Steam is installed and running, pushed from the main process. */
export function useSteamState() {
  const [state, setState] = useState<SteamState | null>(null);

  useEffect(() => {
    window.electron
      .getSteamState()
      .then(setState)
      .catch((error) => logger.error("Failed to read Steam's state", error));
    return window.electron.onSteamStateChanged(setState);
  }, []);

  return state;
}
