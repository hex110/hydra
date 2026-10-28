import { gamesSublevel } from "@main/level";

import { createGameRecordUpdater } from "./game-record-updater-core";

import { libraryWriteQueue } from "./library-sync/library-write-queue";
// Loaded on use: the cloud sync itself writes through this updater.
const updater = createGameRecordUpdater(gamesSublevel, () => {
  void import("./cloud-library-sync").then((sync) =>
    sync.queueCloudLibrarySync()
  );
});
export const updateGameRecord: typeof updater = (key, patch) =>
  libraryWriteQueue.run(() => updater(key, patch));
