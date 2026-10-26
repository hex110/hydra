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
  BackgroundTaskKind,
  IntegrationName,
  LibraryImportSource,
} from "@types";

import { registerEvent } from "./register-event";

registerEvent("getBackgroundTasks", () => getBackgroundTasks());
registerEvent("dismissBackgroundTask", (_event, id: BackgroundTaskKind) => {
  dismissBackgroundTask(id);
});
registerEvent("retryBackgroundTask", (_event, id: BackgroundTaskKind) =>
  retryBackgroundTask(id)
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
