import {
  gamesShopAssetsSublevel,
  gamesSublevel,
  levelKeys,
  steamHistorySublevel,
} from "@main/level";
import type { Game } from "@types";

import { updateBackgroundTask } from "../background-tasks";
import { updateGameRecord } from "../game-record-updater";
import { HydraApi } from "../hydra-api";
import { libraryWriteQueue } from "../library-sync/library-write-queue";
import { logger } from "../logger";
import { steamArtworkUrls } from "../steam-history/steam-history-core";
import {
  isFloppyOnlyEntry,
  type FloppyEntry,
  normalizeTitle,
  pickCatalogueMatch,
  type CatalogueSuggestion,
} from "./floppy-sync-core";

const SUGGESTION_LIMIT = 10;
const CONCURRENCY = 3;

// Remembered for the session so the half-hourly pull does not search again.
const notInCatalogue = new Set<string>();

const searchSteamCatalogue = async (title: string) => {
  try {
    const suggestions = await HydraApi.get<CatalogueSuggestion[]>(
      "/catalogue/search/suggestions",
      { query: title, limit: SUGGESTION_LIMIT, shop: "steam" },
      { needsAuth: false }
    );
    return Array.isArray(suggestions) ? suggestions : [];
  } catch (error) {
    logger.warn("Floppy import: catalogue search failed", { title, error });
    return null;
  }
};

export interface FloppyImportResult {
  added: number;
  linked: number;
  unmatched: string[];
}

const createLibraryGame = async (
  match: CatalogueSuggestion,
  mediaId: string
) => {
  const key = levelKeys.game("steam", match.objectId);
  const artwork = steamArtworkUrls(match.objectId);
  const iconUrl = match.iconUrl ?? artwork.iconUrl;

  if (!(await gamesShopAssetsSublevel.get(key).catch(() => null))) {
    await gamesShopAssetsSublevel.put(key, {
      objectId: match.objectId,
      shop: "steam",
      title: match.title,
      ...artwork,
      iconUrl,
      logoPosition: null,
      coverImageUrl: artwork.libraryImageUrl,
      downloadSources: [],
      updatedAt: Date.now(),
    });
  }

  return libraryWriteQueue.run(async () => {
    if (await gamesSublevel.get(key).catch(() => null)) return false;

    await gamesSublevel.put(key, {
      title: match.title,
      iconUrl,
      libraryHeroImageUrl: artwork.libraryHeroImageUrl,
      logoImageUrl: artwork.logoImageUrl,
      objectId: match.objectId,
      shop: "steam",
      remoteId: null,
      isDeleted: false,
      playTimeInMilliseconds: 0,
      lastTimePlayed: null,
      addedToLibraryAt: null,
      source: "hydra",
      floppyImported: true,
      floppyMediaId: mediaId,
    });
    return true;
  });
};

/**
 * Adds the Floppy games played outside Steam to the library as uninstalled
 * entries, matching each by exact title to a catalogue game. A game already in
 * the library under that catalogue id is linked instead. Anything the user
 * removed or unlinked stays as they left it.
 */
export const importFloppyOnlyGames = async (
  entries: FloppyEntry[],
  games: Game[]
): Promise<FloppyImportResult> => {
  const ownedSteamTitles = new Set(
    (await steamHistorySublevel.values().all()).map((item) =>
      normalizeTitle(item.name)
    )
  );
  const linkedIds = new Set(
    games.flatMap((game) => (game.floppyMediaId ? [game.floppyMediaId] : []))
  );
  const knownTitles = new Set(games.map((game) => normalizeTitle(game.title)));

  const candidates = entries.filter(
    (entry) =>
      !linkedIds.has(entry.mediaId) &&
      !knownTitles.has(normalizeTitle(entry.title)) &&
      isFloppyOnlyEntry(entry, ownedSteamTitles)
  );

  const result: FloppyImportResult = { added: 0, linked: 0, unmatched: [] };
  let next = 0;
  let processed = 0;
  updateBackgroundTask("floppy-import", {
    state: "running",
    processed: 0,
    total: candidates.length,
    result: null,
  });

  const worker = async () => {
    while (next < candidates.length) {
      const entry = candidates[next++];

      try {
        if (notInCatalogue.has(entry.mediaId)) {
          result.unmatched.push(entry.title);
          continue;
        }

        const suggestions = await searchSteamCatalogue(entry.title);
        if (!suggestions) continue;

        const match = pickCatalogueMatch(entry.title, suggestions);
        if (!match) {
          notInCatalogue.add(entry.mediaId);
          result.unmatched.push(entry.title);
          continue;
        }

        const key = levelKeys.game("steam", match.objectId);
        const existing = await gamesSublevel.get(key).catch(() => null);

        if (!existing) {
          if (await createLibraryGame(match, entry.mediaId)) result.added += 1;
        } else if (
          !existing.isDeleted &&
          !existing.floppyMediaId &&
          !existing.floppyUnlinked
        ) {
          await updateGameRecord(key, { floppyMediaId: entry.mediaId });
          result.linked += 1;
        }
      } catch (error) {
        logger.error("Floppy import failed for a game", {
          title: entry.title,
          error,
        });
      } finally {
        processed += 1;
        updateBackgroundTask("floppy-import", { processed });
      }
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  updateBackgroundTask("floppy-import", {
    state: "done",
    processed: candidates.length,
    total: candidates.length,
    result: {
      added: result.added,
      linked: result.linked,
      unmatched: result.unmatched.length,
    },
  });
  return result;
};
