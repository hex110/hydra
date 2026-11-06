import { useEffect, useState } from "react";
import type { SteamAppInstallState } from "@types";

const DOWNLOADING_POLL_MS = 2000;
const IDLE_POLL_MS = 3000;

const NONE: SteamAppInstallState = { state: "none" };

/**
 * Steam's own install state for an app, read from its manifest. Steam does the
 * downloading, so this is the only way to see it; it polls while enabled.
 */
export function useSteamInstallState(appId: string | null, enabled: boolean) {
  const [install, setInstall] = useState<SteamAppInstallState>(NONE);

  useEffect(() => {
    setInstall(NONE);
    if (!appId || !enabled) return;

    let cancelled = false;
    let timer: number | undefined;

    const poll = async () => {
      let next: SteamAppInstallState = NONE;
      try {
        next = await window.electron.getSteamInstallState(appId);
      } catch {
        // Keep polling; Steam may simply not be installed.
      }
      if (cancelled) return;

      setInstall((current) =>
        current.state === next.state &&
        (current.state !== "downloading" ||
          (next.state === "downloading" && current.progress === next.progress))
          ? current
          : next
      );
      timer = window.setTimeout(
        poll,
        next.state === "downloading" ? DOWNLOADING_POLL_MS : IDLE_POLL_MS
      );
    };

    void poll();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [appId, enabled]);

  return install;
}
