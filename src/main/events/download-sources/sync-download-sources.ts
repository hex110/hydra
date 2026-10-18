import { HydraApi } from "@main/services";
import { LocalSources } from "@main/services/local-sources/local-sources";
import { GameUpdates } from "@main/services/game-updates";
import { registerEvent } from "../register-event";
import { downloadSourcesSublevel } from "@main/level";
import type { DownloadSource } from "@types";

const syncDownloadSources = async (_event: Electron.IpcMainInvokeEvent) => {
  const downloadSources = await downloadSourcesSublevel.values().all();

  const response = await HydraApi.post<DownloadSource[]>(
    "/download-sources/sync",
    {
      ids: downloadSources.map((downloadSource) => downloadSource.id),
    },
    { needsAuth: false }
  );

  for (const downloadSource of response) {
    const existingDownloadSource = downloadSources.find(
      (source) => source.id === downloadSource.id
    );

    await downloadSourcesSublevel.put(downloadSource.id, {
      ...existingDownloadSource,
      ...downloadSource,
    });
  }

  // Refreshes stale local copies in the background, then looks for updates.
  void LocalSources.refreshAll().then(() => GameUpdates.checkAllIfEnabled());
};

registerEvent("syncDownloadSources", syncDownloadSources);
