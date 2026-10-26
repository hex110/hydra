import { gamesSublevel } from "@main/level";
import { isUntouchedImport } from "@shared";
import type { LibraryImportSource } from "@types";

import { libraryWriteQueue } from "./library-sync/library-write-queue";
import { WindowManager } from "./window-manager";

const removableKeys = async (source: LibraryImportSource) => {
  const keys: string[] = [];
  for await (const [key, game] of gamesSublevel.iterator()) {
    if (isUntouchedImport(game, source)) keys.push(key);
  }
  return keys;
};

/** How many of an import's library entries the user has not made their own. */
export const countRemovableImports = async (source: LibraryImportSource) =>
  (await removableKeys(source)).length;

/**
 * Deletes the entries an import added that the user never touched. The
 * records go entirely, so turning the import back on adds them again; games
 * the user downloaded, played or edited stay.
 */
export const removeImportedGames = async (source: LibraryImportSource) => {
  const keys = await removableKeys(source);

  const removed = await libraryWriteQueue.run(async () => {
    let count = 0;
    for (const key of keys) {
      const latest = await gamesSublevel.get(key).catch(() => null);
      if (!latest || !isUntouchedImport(latest, source)) continue;
      await gamesSublevel.del(key);
      count += 1;
    }
    return count;
  });

  if (removed > 0) WindowManager.sendToAppWindows("on-library-batch-complete");
  return removed;
};
