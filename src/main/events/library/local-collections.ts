import { LocalCollections } from "@main/services/local-collections";
import type { SavedLibraryFilter } from "@types";

import { registerEvent } from "../register-event";

registerEvent("listLocalCollections", () => LocalCollections.list());

registerEvent(
  "createLocalCollection",
  (_event, name: string, savedFilter: SavedLibraryFilter | null = null) =>
    LocalCollections.create(name, savedFilter)
);

registerEvent("renameLocalCollection", (_event, id: string, name: string) =>
  LocalCollections.rename(id, name)
);

registerEvent("deleteLocalCollection", (_event, id: string) =>
  LocalCollections.delete(id)
);

registerEvent("syncLocalCollections", () => LocalCollections.syncToAccount());
