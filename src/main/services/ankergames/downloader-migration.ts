import { downloadsSublevel } from "@main/level";
import { Downloader, isAnkerGamesUri } from "@shared";

import { logger } from "../logger";

/** AnkerGames was downloader 16 before upstream 4.3.0 took 16 for FileKeeper. */
const LEGACY_ANKERGAMES_DOWNLOADER = 16;

/** Moves downloads saved with AnkerGames' old number to its new one. */
export const migrateAnkerGamesDownloader = async () => {
  try {
    const entries = await downloadsSublevel.iterator().all();
    for (const [key, download] of entries) {
      if (
        download.downloader === LEGACY_ANKERGAMES_DOWNLOADER &&
        isAnkerGamesUri(download.uri)
      ) {
        await downloadsSublevel.put(key, {
          ...download,
          downloader: Downloader.AnkerGames,
        });
      }
    }
  } catch (error) {
    logger.error("Could not migrate AnkerGames downloads", error);
  }
};
