import { useEffect, useState } from "react";
import type { SteamGameHistory } from "@types";

/** What the Steam history import stored for an app; null while loading or unknown. */
export function useSteamHistory(appId: string | null) {
  const [history, setHistory] = useState<SteamGameHistory | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHistory(null);
    if (!appId) return;

    window.electron
      .getSteamGameHistory(appId)
      .then((value) => {
        if (!cancelled) setHistory(value);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [appId]);

  return history;
}
