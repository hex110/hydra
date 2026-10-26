import {
  getBackgroundTasks,
  removeBackgroundTask,
} from "@main/services/background-tasks";
import type { BackgroundTaskKind } from "@types";

import { registerEvent } from "./register-event";

registerEvent("getBackgroundTasks", () => getBackgroundTasks());
registerEvent("dismissBackgroundTask", (_event, id: BackgroundTaskKind) => {
  removeBackgroundTask(id);
});
