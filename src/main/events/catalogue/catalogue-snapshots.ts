import {
  getCatalogueSnapshot,
  setCatalogueSnapshot,
} from "@main/services/catalogue-snapshots";
import { registerEvent } from "../register-event";

registerEvent("getCatalogueSnapshot", (_event, key: string) =>
  getCatalogueSnapshot(key)
);

registerEvent("setCatalogueSnapshot", (_event, key: string, data: unknown) =>
  setCatalogueSnapshot(key, data)
);
