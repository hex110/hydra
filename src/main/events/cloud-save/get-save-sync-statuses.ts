import { saveSyncStatusSublevel } from "@main/level";

import { registerEvent } from "../register-event";

registerEvent("getSaveSyncStatuses", () =>
  saveSyncStatusSublevel.values().all()
);
