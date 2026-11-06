import {
  dismissBackgroundTask,
  getBackgroundTasks,
  retryBackgroundTask,
} from "@main/services/background-tasks";
import {
  getIntegrationStatuses,
  resetIntegrationStatus,
} from "@main/services/integration-status";
import {
  countRemovableImports,
  removeImportedGames,
} from "@main/services/imported-games";
import type {
  IntegrationName,
  LibraryImportSource,
} from "@types";

import { registerEvent } from "./register-event";

registerEvent("getBackgroundTasks", () => getBackgroundTasks());
registerEvent("dismissBackgroundTask", (_event, key: string) => {
  dismissBackgroundTask(key);
});
registerEvent("retryBackgroundTask", (_event, key: string) =>
  retryBackgroundTask(key)
);

registerEvent("getIntegrationStatuses", () => getIntegrationStatuses());
registerEvent("resetIntegrationStatus", (_event, name: IntegrationName) =>
  resetIntegrationStatus(name)
);
registerEvent("countRemovableImports", (_event, source: LibraryImportSource) =>
  countRemovableImports(source)
);
registerEvent("removeImportedGames", (_event, source: LibraryImportSource) =>
  removeImportedGames(source)
);
