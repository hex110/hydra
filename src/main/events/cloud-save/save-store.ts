import {
  cleanUpActiveSaveStore,
  getSaveStoreUsage,
  isRcloneAvailable,
  testSaveStore,
} from "@main/services/cloud-save/save-store";
import {
  importCloudLibrary,
  listCloudLibraryImports,
  listSyncDevices,
  syncCloudLibrary,
} from "@main/services/cloud-library-sync";
import {
  cancelManualSaveBackup,
  countManualSaveBackupGames,
  isManualSaveBackupRunning,
  runManualSaveBackup,
} from "@main/services/cloud-save/manual-backup";
import type { ManualSaveBackupScope, SaveStoreConfig } from "@types";

import { registerEvent } from "../register-event";

registerEvent("testSaveStore", (_event, config: SaveStoreConfig) =>
  testSaveStore(config)
);
registerEvent("isRcloneAvailable", () => isRcloneAvailable());
registerEvent("getSaveStoreUsage", () => getSaveStoreUsage());
registerEvent("cleanUpSaveStore", () => cleanUpActiveSaveStore());
registerEvent("listSyncDevices", () => listSyncDevices());
registerEvent("syncCloudLibraryNow", () => syncCloudLibrary());
registerEvent("listCloudLibraryImports", () => listCloudLibraryImports());
registerEvent("importCloudLibrary", (_event, deviceId: string) =>
  importCloudLibrary(deviceId)
);
registerEvent(
  "countManualSaveBackupGames",
  (_event, scope: ManualSaveBackupScope) => countManualSaveBackupGames(scope)
);
registerEvent("runManualSaveBackup", (_event, scope: ManualSaveBackupScope) =>
  runManualSaveBackup(scope)
);
registerEvent("cancelManualSaveBackup", () => cancelManualSaveBackup());
registerEvent("isManualSaveBackupRunning", () => isManualSaveBackupRunning());
