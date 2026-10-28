import { queueCloudLibrarySync } from "@main/services/cloud-library-sync";
import { LocalCollections } from "@main/services/local-collections";
import type { SavedLibraryFilter } from "@types";

import { registerEvent } from "../register-event";

registerEvent("listLocalCollections", () => LocalCollections.list());

registerEvent(
  "createLocalCollection",
  async (
    _event,
    name: string,
    savedFilter: SavedLibraryFilter | null = null
  ) => {
    const collection = await LocalCollections.create(name, savedFilter);
    queueCloudLibrarySync();
    return collection;
  }
);

registerEvent(
  "renameLocalCollection",
  async (_event, id: string, name: string) => {
    await LocalCollections.rename(id, name);
    queueCloudLibrarySync();
  }
);

registerEvent("deleteLocalCollection", async (_event, id: string) => {
  await LocalCollections.delete(id);
  queueCloudLibrarySync();
});

registerEvent("syncLocalCollections", () => LocalCollections.syncToAccount());
