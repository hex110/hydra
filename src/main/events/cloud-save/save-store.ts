import {
  cleanUpActiveSaveStore,
  createR2Remote,
  installRclone,
  getSaveStoreUsage,
  isRcloneAvailable,
  testSaveStore,
} from "@main/services/cloud-save/save-store";
import {
  importCloudLibrary,
  listCloudLibraryImports,
  listOtherDeviceRecentGames,
  listSyncDevices,
  syncCloudLibrary,
} from "@main/services/cloud-library-sync";
import {
  cancelManualSaveBackup,
  countManualSaveBackupGames,
  isManualSaveBackupRunning,
  runManualSaveBackup,
} from "@main/services/cloud-save/manual-backup";
import type {
  ManualSaveBackupScope,
  R2Credentials,
  SaveStoreConfig,
} from "@types";

import { registerEvent } from "../register-event";

registerEvent("testSaveStore", (_event, config: SaveStoreConfig) =>
  testSaveStore(config)
);
registerEvent("isRcloneAvailable", () => isRcloneAvailable());
registerEvent("installRclone", () => installRclone());
registerEvent("createR2Remote", (_event, credentials: R2Credentials) =>
  createR2Remote(credentials)
);
registerEvent("getSaveStoreUsage", () => getSaveStoreUsage());
registerEvent("cleanUpSaveStore", () => cleanUpActiveSaveStore());
registerEvent("listSyncDevices", () => listSyncDevices());
registerEvent("listOtherDeviceRecentGames", () => listOtherDeviceRecentGames());
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
