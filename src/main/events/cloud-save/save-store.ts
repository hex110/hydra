import {
  isRcloneAvailable,
  testSaveStore,
} from "@main/services/cloud-save/save-store";
import type { SaveStoreConfig } from "@types";

import { registerEvent } from "../register-event";

registerEvent("testSaveStore", (_event, config: SaveStoreConfig) =>
  testSaveStore(config)
);
registerEvent("isRcloneAvailable", () => isRcloneAvailable());
