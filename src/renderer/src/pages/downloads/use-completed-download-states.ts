import { useEffect, useState } from "react";
import type { GameShop } from "@types";

import { isFinishedDownload } from "../../features/activity/activity";
import type { ActivityItem } from "../../features/activity/activity.types";
import type { CompletedDownloadState } from "./use-completed-download-actions";

/**
 * What each finished download offers depends on the files on disk, which can
 * change outside Hydra, so look again whenever the window regains focus.
 */
export function useCompletedDownloadStates(items: ActivityItem[]) {
  const [states, setStates] = useState<Record<string, CompletedDownloadState>>(
    {}
  );
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const onFocus = () => setRefresh((count) => count + 1);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // A string, so a progress tick elsewhere doesn't look at the disk again.
  const finishedKey = JSON.stringify(
    items.flatMap((item) =>
      item.source.kind === "game-download" &&
      isFinishedDownload(item.source.game) &&
      !item.source.game.download?.extracting
        ? [
            [
              item.source.game.id,
              item.source.game.shop,
              item.source.game.objectId,
            ],
          ]
        : []
    )
  );

  useEffect(() => {
    let cancelled = false;
    const finished = JSON.parse(finishedKey) as [string, GameShop, string][];

    void Promise.all(
      finished.map(async ([id, shop, objectId]) => {
        try {
          const state = await window.electron.getCompletedDownloadState(
            shop,
            objectId
          );
          return [id, state] as const;
        } catch {
          return [id, "open-folder" as const] as const;
        }
      })
    ).then((results) => {
      if (!cancelled) {
        setStates((previous) => ({
          ...previous,
          ...Object.fromEntries(results),
        }));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [finishedKey, refresh]);

  return states;
}
