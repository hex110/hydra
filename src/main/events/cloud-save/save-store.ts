import {
  cleanUpActiveSaveStore,
  getSaveStoreUsage,
  isRcloneAvailable,
  testSaveStore,
} from "@main/services/cloud-save/save-store";
import {
  listSyncDevices,
  syncCloudLibrary,
} from "@main/services/cloud-library-sync";
import type { SaveStoreConfig } from "@types";

import { registerEvent } from "../register-event";

registerEvent("testSaveStore", (_event, config: SaveStoreConfig) =>
  testSaveStore(config)
);
registerEvent("isRcloneAvailable", () => isRcloneAvailable());
registerEvent("getSaveStoreUsage", () => getSaveStoreUsage());
registerEvent("cleanUpSaveStore", () => cleanUpActiveSaveStore());
registerEvent("listSyncDevices", () => listSyncDevices());
registerEvent("syncCloudLibraryNow", () => syncCloudLibrary());
