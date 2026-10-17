import { HydraApi } from "@main/services";
import { downloadSourcesSublevel } from "@main/level";
import { LocalSources } from "@main/services/local-sources/local-sources";
import { registerEvent } from "../register-event";

const removeDownloadSource = async (
  _event: Electron.IpcMainInvokeEvent,
  removeAll = false,
  downloadSourceId?: string
) => {
  const params = new URLSearchParams({
    all: removeAll.toString(),
  });

  if (downloadSourceId) params.set("downloadSourceId", downloadSourceId);

  if (HydraApi.isLoggedIn() && HydraApi.hasActiveSubscription()) {
    void HydraApi.delete(`/profile/download-sources?${params.toString()}`);
  }

  if (removeAll) {
    const sourceIds = await downloadSourcesSublevel.keys().all();
    await downloadSourcesSublevel.clear();
    for (const sourceId of sourceIds) await LocalSources.forget(sourceId);
  } else if (downloadSourceId) {
    await downloadSourcesSublevel.del(downloadSourceId);
    await LocalSources.forget(downloadSourceId);
  }
};

registerEvent("removeDownloadSource", removeDownloadSource);
