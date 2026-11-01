import { useEffect, useState } from "react";

import { logger } from "@renderer/logger";
import { summarizeSaveSync, type SaveSyncSummary } from "@shared";

/** The last automatic save backups, refreshed as syncs finish. */
export function useSaveSyncSummary() {
  const [summary, setSummary] = useState<SaveSyncSummary | null>(null);
  const [hasAny, setHasAny] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      window.electron
        .getSaveSyncStatuses()
        .then((statuses) => {
          if (cancelled) return;
          setHasAny(statuses.length > 0);
          setSummary(summarizeSaveSync(statuses));
        })
        .catch((error) => logger.error("Failed to load save sync", error));

    void load();
    const unsubscribe = window.electron.onCloudSaveAutomaticSync((event) => {
      if (event.status !== "progress") void load();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return hasAny ? summary : null;
}
